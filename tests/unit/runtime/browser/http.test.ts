import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http'
import type { AddressInfo } from 'node:net'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import type { AbortSignalLike } from '../../../../src/utils/abort.js'
import { CanceledError, RequestError, SerializationError } from '../../../../src/error/types.js'
import { ClientErrorRetryable } from '../../../../src/retry/retryable.js'
import type { StreamLike } from '../../../../src/transport/types.js'
import { bytesBody, stringBody, streamBody } from '../../../../src/transport/content.js'
import { blobBody } from '../../../../src/runtime/browser/content.js'
import { utf8Decode, utf8Encode } from '../../../../src/utils/bytes.js'
import { createHeaderFields } from '../../../../src/utils/header-fields.js'
import { createBrowserTransport } from '../../../../src/runtime/browser/http.js'

const transport = createBrowserTransport()

let server: Server
let base: string
let handler: (req: IncomingMessage, res: ServerResponse) => void
let seen: { method: string; url: string; body: string; contentType?: string } | undefined

beforeAll(async () => {
  server = createServer((req, res) => handler(req, res))
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  base = 'http://127.0.0.1:' + String((server.address() as AddressInfo).port)
})

afterAll(async () => {
  await new Promise<void>((resolve, reject) => {
    server.close((err) => (err ? reject(err) : resolve()))
  })
})

beforeEach(() => {
  seen = undefined
  handler = (req, res) => {
    const chunks: Buffer[] = []
    req.on('data', (chunk: Buffer) => {
      chunks.push(chunk)
    })
    req.on('end', () => {
      seen = {
        method: req.method ?? '',
        url: req.url ?? '',
        body: Buffer.concat(chunks).toString('utf8'),
        contentType: req.headers['content-type'],
      }
      res.writeHead(200, { ETag: '"abc"', 'x-oss-request-id': 'RID' })
      res.end('served')
    })
  }
})

interface CountingSignal extends AbortSignalLike {
  aborted: boolean
  added: number
  removed: number
  abort: () => void
}

function countingSignal(): CountingSignal {
  const listeners = new Set<() => void>()
  const signal: CountingSignal = {
    aborted: false,
    added: 0,
    removed: 0,
    addEventListener: (_type: 'abort', listener: () => void): void => {
      listeners.add(listener)
      signal.added++
    },
    removeEventListener: (_type: 'abort', listener: () => void): void => {
      listeners.delete(listener)
      signal.removed++
    },
    abort: (): void => {
      signal.aborted = true
      for (const listener of listeners) listener()
    },
  }
  return signal
}

describe('createBrowserTransport', () => {
  it('round-trips a request and lowercases the response headers', async () => {
    const response = await transport.send(
      { method: 'GET', url: base + '/bucket/key?versionId=v1', headers: createHeaderFields({ 'x-oss-meta-a': '1' }) },
      {},
    )
    expect(seen?.method).toBe('GET')
    expect(seen?.url).toBe('/bucket/key?versionId=v1')
    expect(response.statusCode).toBe(200)
    expect(response.status).toBe('OK')
    expect(response.headers.etag).toBe('"abc"')
    expect(response.headers['x-oss-request-id']).toBe('RID')
    expect(await response.body?.text()).toBe('served')
  })

  it('sends a Uint8Array body', async () => {
    await transport.send(
      { method: 'PUT', url: base + '/k', headers: createHeaderFields({ 'Content-Type': 'application/octet-stream' }), body: bytesBody(utf8Encode('bytes!')) },
      {},
    )
    expect(seen?.body).toBe('bytes!')
    expect(seen?.contentType).toBe('application/octet-stream')
  })

  it('sends a string body', async () => {
    await transport.send({ method: 'POST', url: base + '/k', headers: createHeaderFields({}), body: stringBody('<Delete/>') }, {})
    expect(seen?.body).toBe('<Delete/>')
  })

  it('sends a Blob body', async () => {
    await transport.send({ method: 'PUT', url: base + '/k', headers: createHeaderFields({}), body: blobBody(new Blob(['blobbed'])) }, {})
    expect(seen?.body).toBe('blobbed')
  })

  it('rejects a one-shot stream body instead of buffering it', async () => {
    const body: StreamLike = { read: (): Promise<Uint8Array | null> => Promise.resolve(null) }
    await expect(
      transport.send({ method: 'PUT', url: base + '/k', headers: createHeaderFields({}), body: streamBody(body) }, {}),
    ).rejects.toBeInstanceOf(SerializationError)
  })

  it('memoizes bytes() and shares it with text()', async () => {
    const response = await transport.send({ method: 'GET', url: base + '/k', headers: createHeaderFields({}) }, {})
    expect(utf8Decode(await response.body!.bytes())).toBe('served')
    expect(await response.body!.text()).toBe('served')
  })

  it('reads the response through stream()', async () => {
    const response = await transport.send({ method: 'GET', url: base + '/k', headers: createHeaderFields({}) }, {})
    const parts: string[] = []
    const stream = response.body!.stream()
    for (;;) {
      const chunk = await stream.read()
      if (chunk === null) break
      parts.push(utf8Decode(chunk))
    }
    expect(parts.join('')).toBe('served')
  })

  it('returns a 4xx as a response, not an error', async () => {
    handler = (req, res) => {
      req.resume()
      res.writeHead(404)
      res.end('<Error><Code>NoSuchKey</Code></Error>')
    }
    const response = await transport.send({ method: 'GET', url: base + '/k', headers: createHeaderFields({}) }, {})
    expect(response.statusCode).toBe(404)
    expect(await response.body!.text()).toContain('NoSuchKey')
  })

  it('rejects with CanceledError when the signal is already aborted', async () => {
    const controller = new AbortController()
    controller.abort()
    await expect(
      transport.send({ method: 'GET', url: base + '/k', headers: createHeaderFields({}) }, { signal: controller.signal }),
    ).rejects.toBeInstanceOf(CanceledError)
  })

  it('rejects with CanceledError when aborted in flight', async () => {
    handler = (req) => {
      req.resume()
    }
    const controller = new AbortController()
    const pending = transport.send({ method: 'GET', url: base + '/k', headers: createHeaderFields({}) }, { signal: controller.signal })
    await new Promise((resolve) => setTimeout(resolve, 20))
    controller.abort()
    await expect(pending).rejects.toBeInstanceOf(CanceledError)
  })

  it('reports an opaque fetch failure as a retryable RequestError', async () => {
    const idle = createServer()
    await new Promise<void>((resolve) => idle.listen(0, '127.0.0.1', resolve))
    const port = (idle.address() as AddressInfo).port
    await new Promise<void>((resolve) => idle.close(() => resolve()))

    const error = await transport
      .send({ method: 'GET', url: 'http://127.0.0.1:' + String(port) + '/k', headers: createHeaderFields({}) }, {})
      .then(() => undefined)
      .catch((err: unknown) => err as Error)
    expect(error).toBeInstanceOf(RequestError)
    expect(new ClientErrorRetryable().isErrorRetryable(error!)).toBe(true)
  })

  it('removes its abort listener once a buffered body settles', async () => {
    const signal = countingSignal()
    const response = await transport.send({ method: 'GET', url: base + '/k', headers: createHeaderFields({}) }, { signal })
    await response.body?.text()

    expect(signal.added).toBe(1)
    expect(signal.removed).toBe(1)
  })

  it('removes its abort listener once a stream() body reaches its end', async () => {
    const signal = countingSignal()
    const response = await transport.send({ method: 'GET', url: base + '/k', headers: createHeaderFields({}) }, { signal })
    const stream = response.body!.stream()
    for (;;) {
      if ((await stream.read()) === null) break
    }

    expect(signal.removed).toBe(1)
  })

  it('removes its abort listener when the request fails before the headers', async () => {
    handler = (req) => {
      req.resume()
    }
    const signal = countingSignal()
    const pending = transport.send({ method: 'GET', url: base + '/k', headers: createHeaderFields({}) }, { signal })
    await new Promise((resolve) => setTimeout(resolve, 20))
    signal.abort()

    await expect(pending).rejects.toBeInstanceOf(CanceledError)
    expect(signal.removed).toBe(1)
  })

  it('cancels a streaming body read through the caller signal', async () => {
    handler = (req, res) => {
      req.resume()
      res.writeHead(200)
      res.write('first')
    }
    const signal = countingSignal()
    const response = await transport.send(
      { method: 'GET', url: base + '/k', headers: createHeaderFields({}) },
      { responseStream: true, signal },
    )
    expect(response.statusCode).toBe(200)

    setTimeout(() => signal.abort(), 20)
    await expect(response.body!.text()).rejects.toBeInstanceOf(CanceledError)
    expect(signal.removed).toBe(1)
  })

  it('cancels a stream() read through the caller signal', async () => {
    handler = (req, res) => {
      req.resume()
      res.writeHead(200)
      res.write('first')
    }
    const controller = new AbortController()
    const response = await transport.send(
      { method: 'GET', url: base + '/k', headers: createHeaderFields({}) },
      { responseStream: true, signal: controller.signal },
    )
    const stream = response.body!.stream()
    expect(utf8Decode((await stream.read()) ?? new Uint8Array(0))).toBe('first')

    setTimeout(() => controller.abort(), 20)
    await expect(stream.read()).rejects.toBeInstanceOf(CanceledError)
  })

  it('resolves only once the whole body has arrived', async () => {
    let ended = false
    handler = (req, res) => {
      req.resume()
      res.writeHead(200)
      res.write('first')
      setTimeout(() => {
        ended = true
        res.end('second')
      }, 120)
    }
    const pending = transport.send({ method: 'GET', url: base + '/k', headers: createHeaderFields({}) }, {})
    await new Promise((resolve) => setTimeout(resolve, 40))
    let settled = false
    void pending.then(() => {
      settled = true
    })
    await new Promise((resolve) => setTimeout(resolve, 20))

    expect(settled).toBe(false)
    expect(await (await pending).body?.text()).toBe('firstsecond')
    expect(ended).toBe(true)
  })

  it('rejects a body that breaks mid-transfer as a retryable RequestError', async () => {
    handler = (req, res) => {
      req.resume()
      res.writeHead(200)
      res.write('partial')
      setTimeout(() => res.destroy(), 50)
    }
    const error = await transport
      .send({ method: 'GET', url: base + '/k', headers: createHeaderFields({}) }, {})
      .then(() => undefined)
      .catch((err: unknown) => err as Error)
    expect(error).toBeInstanceOf(RequestError)
    expect(new ClientErrorRetryable().isErrorRetryable(error!)).toBe(true)
  })

  it('hands back a lazy body for a streamed 2xx', async () => {
    let ended = false
    handler = (req, res) => {
      req.resume()
      res.writeHead(200)
      res.write('first')
      setTimeout(() => {
        ended = true
        res.end('second')
      }, 120)
    }
    const response = await transport.send(
      { method: 'GET', url: base + '/k', headers: createHeaderFields({}) },
      { responseStream: true },
    )

    expect(ended).toBe(false)
    expect(await response.body?.text()).toBe('firstsecond')
  })

  it('buffers a 203 or a 4xx body despite responseStream: true', async () => {
    for (const statusCode of [203, 404]) {
      let ended = false
      handler = (req, res) => {
        req.resume()
        res.writeHead(statusCode)
        res.write('partial')
        setTimeout(() => {
          ended = true
          res.end('second')
        }, 120)
      }
      const response = await transport.send(
        { method: 'GET', url: base + '/k', headers: createHeaderFields({}) },
        { responseStream: true },
      )

      expect(ended).toBe(true)
      expect(await response.body?.text()).toBe('partialsecond')
    }
  })

  it('rejects a broken error body inside send, where the retryer can see it', async () => {
    handler = (req, res) => {
      req.resume()
      res.writeHead(404)
      res.write('<Error>')
      setTimeout(() => res.destroy(), 50)
    }
    const error = await transport
      .send({ method: 'GET', url: base + '/k', headers: createHeaderFields({}) }, { responseStream: true })
      .then(() => undefined)
      .catch((err: unknown) => err as Error)
    expect(error).toBeInstanceOf(RequestError)
    expect(new ClientErrorRetryable().isErrorRetryable(error!)).toBe(true)
  })
})

describe('createBrowserTransport platform', () => {
  it('omits it, because the browser drops User-Agent anyway', () => {
    expect(transport.platform).toBeUndefined()
  })

  it('cannot stream the request body: fetch takes it whole', () => {
    expect(transport.canStreamUpload).toBe(false)
  })

  // Fetch gives script no way to choose a proxy; `proxyHost` is ignored.
  it('ignores proxyHost, sending to the origin directly', async () => {
    const response = await createBrowserTransport({ proxyHost: 'http://10.0.0.1:3128' }).send(
      { method: 'GET', url: base + '/key', headers: createHeaderFields({}) },
      {},
    )

    expect(response.statusCode).toBe(200)
    expect(seen?.url).toBe('/key')
  })

  // Fetch gives script no control over certificate verification; the flag is ignored.
  it('ignores insecureSkipVerify, still reaching the server', async () => {
    const response = await createBrowserTransport({ insecureSkipVerify: true }).send(
      { method: 'GET', url: base + '/key', headers: createHeaderFields({}) },
      {},
    )

    expect(response.statusCode).toBe(200)
  })

  // Fetch follows redirects and offers script no toggle; the flag is ignored.
  it('ignores enabledRedirect, still reaching the server', async () => {
    const response = await createBrowserTransport({ enabledRedirect: true }).send(
      { method: 'GET', url: base + '/key', headers: createHeaderFields({}) },
      {},
    )

    expect(response.statusCode).toBe(200)
  })
})

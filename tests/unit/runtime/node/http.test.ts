import {
  createServer,
  type IncomingHttpHeaders,
  type IncomingMessage,
  type Server,
  type ServerResponse,
} from 'node:http'
import { createServer as createHttpsServer, type Server as HttpsServer } from 'node:https'
import type { AddressInfo, Socket } from 'node:net'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { CanceledError, RequestError } from '../../../../src/error/types.js'
import { ClientErrorRetryable } from '../../../../src/retry/retryable.js'
import type { AbortSignalLike } from '../../../../src/utils/abort.js'
import type { StreamLike } from '../../../../src/transport/types.js'
import { bytesBody, stringBody, streamBody } from '../../../../src/transport/content.js'
import { utf8Decode, utf8Encode } from '../../../../src/utils/bytes.js'
import { createHeaderFields } from '../../../../src/utils/header-fields.js'
import { BodyTap, createNodeTransport } from '../../../../src/runtime/node/http.js'
import { blobBody } from '../../../../src/runtime/node/blob-content.js'

type Handler = (req: IncomingMessage, res: ServerResponse) => void

interface Seen {
  method: string
  url: string
  headers: IncomingHttpHeaders
  body: string
}

/** Test `AbortSignalLike` implementation without an `AbortController`. */
class TestSignal implements AbortSignalLike {
  aborted = false
  private listeners: (() => void)[] = []

  addEventListener(_type: 'abort', listener: () => void): void {
    this.listeners.push(listener)
  }

  removeEventListener(_type: 'abort', listener: () => void): void {
    const at = this.listeners.indexOf(listener)
    if (at >= 0) this.listeners.splice(at, 1)
  }

  get listenerCount(): number {
    return this.listeners.length
  }

  abort(): void {
    this.aborted = true
    for (const listener of this.listeners.slice()) listener()
  }
}

const transport = createNodeTransport()

let server: Server
let base: string
let handler: Handler
let seen: Seen | undefined
let requests = 0
const sockets = new Set<Socket>()

function respond(statusCode: number, body: string, headers?: Record<string, string | string[]>): Handler {
  return (req, res) => {
    const chunks: Buffer[] = []
    req.on('data', (chunk: Buffer) => {
      chunks.push(chunk)
    })
    req.on('end', () => {
      seen = {
        method: req.method ?? '',
        url: req.url ?? '',
        headers: req.headers,
        body: Buffer.concat(chunks).toString('utf8'),
      }
      res.writeHead(statusCode, headers)
      res.end(body)
    })
  }
}

async function drain(stream: StreamLike): Promise<string> {
  const parts: string[] = []
  for (;;) {
    const chunk = await stream.read()
    if (chunk === null) break
    parts.push(utf8Decode(chunk))
  }
  return parts.join('')
}

beforeAll(async () => {
  server = createServer((req, res) => {
    requests++
    handler(req, res)
  })
  server.on('connection', (socket) => {
    sockets.add(socket)
    socket.on('close', () => sockets.delete(socket))
  })
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  base = 'http://127.0.0.1:' + String((server.address() as AddressInfo).port)
})

afterAll(async () => {
  for (const socket of sockets) socket.destroy()
  await new Promise<void>((resolve, reject) => {
    server.close((err) => (err ? reject(err) : resolve()))
  })
})

beforeEach(() => {
  seen = undefined
  requests = 0
  handler = respond(200, 'ok')
})

describe('createNodeTransport', () => {
  it('round-trips the method, path, query and headers', async () => {
    const response = await transport.send(
      {
        method: 'GET',
        url: base + '/bucket/a%2Fb.txt?versionId=v1&acl',
        headers: createHeaderFields({ 'x-oss-meta-Kind': 'test', Date: 'Wed, 17 Aug 2026 00:00:00 GMT' }),
      },
      {},
    )

    expect(seen?.method).toBe('GET')
    expect(seen?.url).toBe('/bucket/a%2Fb.txt?versionId=v1&acl')
    expect(seen?.headers['x-oss-meta-kind']).toBe('test')
    expect(seen?.headers.date).toBe('Wed, 17 Aug 2026 00:00:00 GMT')
    expect(response.statusCode).toBe(200)
    expect(response.status).toBe('OK')
    expect(await response.body?.text()).toBe('ok')
  })

  it('sends a Uint8Array body with a Content-Length', async () => {
    await transport.send({ method: 'PUT', url: base + '/bucket/key', headers: createHeaderFields({}), body: bytesBody(utf8Encode('hello bytes')) }, {})
    expect(seen?.body).toBe('hello bytes')
    expect(seen?.headers['content-length']).toBe('11')
    expect(seen?.headers['transfer-encoding']).toBeUndefined()
  })

  it('sends a string body', async () => {
    await transport.send({ method: 'PUT', url: base + '/bucket/key', headers: createHeaderFields({}), body: stringBody('<Xml/>') }, {})
    expect(seen?.body).toBe('<Xml/>')
    expect(seen?.headers['content-length']).toBe('6')
  })

  it('streams a Blob body with its known Content-Length', async () => {
    await transport.send(
      {
        method: 'PUT',
        url: base + '/bucket/key',
        headers: createHeaderFields({}),
        body: blobBody(new Blob(['hello blob'])),
      },
      {},
    )
    expect(seen?.body).toBe('hello blob')
    expect(seen?.headers['content-length']).toBe('10')
    expect(seen?.headers['transfer-encoding']).toBeUndefined()
  })

  it('streams a StreamLike body', async () => {
    const chunks = ['alpha', 'beta', 'gamma']
    let at = 0
    const body: StreamLike = {
      read: (): Promise<Uint8Array | null> => Promise.resolve(at < chunks.length ? utf8Encode(chunks[at++]) : null),
    }

    await transport.send({ method: 'PUT', url: base + '/bucket/key', headers: createHeaderFields({}), body: streamBody(body) }, {})
    expect(seen?.body).toBe('alphabetagamma')
    // No Content-Length supplied, so Node falls back to chunked encoding.
    expect(seen?.headers['transfer-encoding']).toBe('chunked')
  })

  it('rejects with the body error when a streamed body fails mid-flight', async () => {
    handler = (req) => {
      req.on('error', () => undefined)
      req.resume()
    }
    const boom = new Error('disk went away')
    let reads = 0
    const body: StreamLike = {
      read: (): Promise<Uint8Array | null> => {
        reads++
        return reads === 1 ? Promise.resolve(utf8Encode('first')) : Promise.reject(boom)
      },
    }

    await expect(transport.send({ method: 'PUT', url: base + '/k', headers: createHeaderFields({}), body: streamBody(body) }, {})).rejects.toBe(boom)
  })

  it('stops pulling a streamed body while the socket is full', async () => {
    const chunkCount = 256
    const chunkSize = 1024 * 1024
    let produced = 0
    const body: StreamLike = {
      read: (): Promise<Uint8Array | null> => {
        if (produced >= chunkCount) return Promise.resolve(null)
        produced++
        return Promise.resolve(new Uint8Array(chunkSize))
      },
    }

    let received = 0
    let release = (): void => undefined
    handler = (req, res) => {
      release = (): void => {
        req.on('data', (chunk: Buffer) => {
          received += chunk.length
        })
        req.on('end', () => res.end('ok'))
        req.resume()
      }
    }

    const pending = transport.send({ method: 'PUT', url: base + '/k', headers: createHeaderFields({}), body: streamBody(body) }, {})
    await new Promise((resolve) => setTimeout(resolve, 100))
    const stalled = produced
    release()
    await pending

    expect(stalled).toBeLessThan(chunkCount)
    expect(received).toBe(chunkCount * chunkSize)
  })

  it('cancels the body cursor when aborted in flight', async () => {
    const chunkCount = 256
    const chunkSize = 1024 * 1024
    let produced = 0
    let canceled = 0
    const body: StreamLike = {
      read: (): Promise<Uint8Array | null> => {
        if (produced >= chunkCount) return Promise.resolve(null)
        produced++
        return Promise.resolve(new Uint8Array(chunkSize))
      },
      cancel: (): void => {
        canceled++
      },
    }

    handler = () => undefined

    const signal = new TestSignal()
    const pending = transport.send({ method: 'PUT', url: base + '/k', headers: createHeaderFields({}), body: streamBody(body) }, { signal })
    await new Promise((resolve) => setTimeout(resolve, 100))
    signal.abort()
    await expect(pending).rejects.toBeInstanceOf(CanceledError)
    await new Promise((resolve) => setTimeout(resolve, 20))
    expect(produced).toBeLessThan(chunkCount)
    expect(canceled).toBe(1)
  })

  it('reuses connections across sequential requests', async () => {
    const used = new Set<Socket>()
    handler = (req, res) => {
      used.add(req.socket)
      req.resume()
      res.end('ok')
    }

    for (let i = 0; i < 4; i++) {
      const response = await transport.send({ method: 'GET', url: base + '/k', headers: createHeaderFields({}) }, {})
      await response.body!.bytes()
    }

    expect(requests).toBe(4)
    expect(used.size).toBeLessThan(4)
  })

  it('passes its options through to the agents', async () => {
    const used = new Set<Socket>()
    handler = (req, res) => {
      used.add(req.socket)
      req.resume()
      res.end('ok')
    }
    const noKeepAlive = createNodeTransport({ keepAlive: false })

    for (let i = 0; i < 2; i++) {
      const response = await noKeepAlive.send({ method: 'GET', url: base + '/k', headers: createHeaderFields({}) }, {})
      await response.body?.text()
    }

    expect(used.size).toBe(2)
  })

  it('memoizes bytes() so the body can be read twice', async () => {
    handler = respond(200, 'read me')
    const response = await transport.send({ method: 'GET', url: base + '/k', headers: createHeaderFields({}) }, {})
    expect(utf8Decode(await response.body!.bytes())).toBe('read me')
    expect(utf8Decode(await response.body!.bytes())).toBe('read me')
  })

  it('decodes text() as UTF-8', async () => {
    handler = respond(200, '键值 ✓')
    const response = await transport.send({ method: 'GET', url: base + '/k', headers: createHeaderFields({}) }, {})
    expect(await response.body!.text()).toBe('键值 ✓')
  })

  it('reads the response through stream()', async () => {
    handler = (req, res) => {
      req.resume()
      res.writeHead(200)
      res.write('first ')
      res.write('second ')
      res.end('third')
    }
    const response = await transport.send({ method: 'GET', url: base + '/k', headers: createHeaderFields({}) }, {})
    expect(await drain(response.body!.stream())).toBe('first second third')
  })

  it('lowercases response header names and joins repeated ones', async () => {
    handler = respond(200, '', { ETag: '"abc"', 'X-OSS-Request-Id': 'RID', 'Set-Cookie': ['a=1', 'b=2'] })
    const response = await transport.send({ method: 'GET', url: base + '/k', headers: createHeaderFields({}) }, {})
    expect(response.headers.etag).toBe('"abc"')
    expect(response.headers['x-oss-request-id']).toBe('RID')
    expect(response.headers['set-cookie']).toBe('a=1, b=2')
    expect(response.headers.ETag).toBeUndefined()
  })

  // Node preserves the server's reason phrase in `statusMessage`.
  it('reports the reason phrase the server sent', async () => {
    handler = (req, res) => {
      req.resume()
      res.writeHead(404, 'Not Found Here')
      res.end()
    }
    const response = await transport.send({ method: 'GET', url: base + '/k', headers: createHeaderFields({}) }, {})
    expect(response.status).toBe('Not Found Here')
    expect(response.statusCode).toBe(404)
  })

  it('returns a 4xx as a response, not an error', async () => {
    handler = respond(403, '<Error><Code>AccessDenied</Code></Error>')
    const response = await transport.send({ method: 'GET', url: base + '/k', headers: createHeaderFields({}) }, {})
    expect(response.statusCode).toBe(403)
    expect(await response.body!.text()).toContain('AccessDenied')
  })

  it('rejects without connecting when the signal is already aborted', async () => {
    const signal = new TestSignal()
    signal.abort()
    await expect(transport.send({ method: 'GET', url: base + '/k', headers: createHeaderFields({}) }, { signal })).rejects.toBeInstanceOf(
      CanceledError,
    )
    expect(requests).toBe(0)
  })

  it('rejects with CanceledError when aborted in flight', async () => {
    handler = (req) => {
      req.resume()
      // Never answers; the abort is the only thing that can end this request.
    }
    const signal = new TestSignal()
    const pending = transport.send({ method: 'GET', url: base + '/k', headers: createHeaderFields({}) }, { signal })
    await new Promise((resolve) => setTimeout(resolve, 20))
    signal.abort()
    await expect(pending).rejects.toBeInstanceOf(CanceledError)
  })

  it('removes its abort listener once the request finishes', async () => {
    const signal = new TestSignal()
    const response = await transport.send({ method: 'GET', url: base + '/k', headers: createHeaderFields({}) }, { signal })
    await response.body!.bytes()
    await new Promise((resolve) => setTimeout(resolve, 20))
    expect(signal.listenerCount).toBe(0)
  })

  it('reports a refused connection as a retryable RequestError', async () => {
    const idle = createServer()
    await new Promise<void>((resolve) => idle.listen(0, '127.0.0.1', resolve))
    const port = (idle.address() as AddressInfo).port
    await new Promise<void>((resolve) => idle.close(() => resolve()))

    const error = await transport
      .send({ method: 'GET', url: 'http://127.0.0.1:' + String(port) + '/k', headers: createHeaderFields({}) }, {})
      .then(() => undefined)
      .catch((err: unknown) => err as Error)
    expect(error).toBeInstanceOf(RequestError)
    expect(error?.message).toContain('ECONNREFUSED')
    expect(new ClientErrorRetryable().isErrorRetryable(error!)).toBe(true)
  })

  it('applies the idle deadline it was built with to a send that overrides none', async () => {
    handler = (req) => {
      req.resume()
    }
    const built = createNodeTransport({ readWriteTimeoutMs: 120 })
    const error = await built
      .send({ method: 'GET', url: base + '/k', headers: createHeaderFields({}) }, {})
      .then(() => undefined)
      .catch((err: unknown) => err as Error)
    expect(error).toBeInstanceOf(RequestError)
    expect(error?.message).toContain('120ms')
  })

  it('lets a send override the idle deadline it was built with, either way', async () => {
    handler = (req) => {
      req.resume()
    }
    const built = createNodeTransport({ readWriteTimeoutMs: 5_000 })
    const error = await built
      .send({ method: 'GET', url: base + '/k', headers: createHeaderFields({}) }, { readWriteTimeoutMs: 120 })
      .then(() => undefined)
      .catch((err: unknown) => err as Error & { code?: string })
    expect(error?.message).toContain('120ms')

    handler = (req, res) => {
      req.resume()
      setTimeout(() => res.end('late'), 200)
    }
    const impatient = createNodeTransport({ readWriteTimeoutMs: 60 })
    const response = await impatient.send(
      { method: 'GET', url: base + '/k', headers: createHeaderFields({}) },
      { readWriteTimeoutMs: 4_000 },
    )
    expect(await response.body?.text()).toBe('late')
  })

  it('stops the connect budget once the socket is connected', async () => {
    handler = (req, res) => {
      req.resume()
      setTimeout(() => res.end('slow'), 150)
    }
    const built = createNodeTransport({ connectTimeoutMs: 40 })
    const response = await built.send({ method: 'GET', url: base + '/k', headers: createHeaderFields({}) }, {})

    expect(await response.body?.text()).toBe('slow')
  })

  it('applies the idle deadline to a response body that stalls', async () => {
    handler = (req, res) => {
      req.resume()
      res.writeHead(200)
      res.write('partial')
      // Never calls end(): the body never completes.
    }
    const built = createNodeTransport({ readWriteTimeoutMs: 150 })
    const error = await built
      .send({ method: 'GET', url: base + '/k', headers: createHeaderFields({}) }, {})
      .then(() => undefined)
      .catch((err: unknown) => err as Error)
    expect(error).toBeInstanceOf(RequestError)
    expect(error?.message).toContain('150ms')
  })

  it('rejects a lazy body read that outlives the idle deadline', async () => {
    handler = (req, res) => {
      req.resume()
      res.writeHead(200)
      res.write('partial')
      // Never calls end().
    }
    const built = createNodeTransport({ readWriteTimeoutMs: 100 })
    const response = await built.send(
      { method: 'GET', url: base + '/k', headers: createHeaderFields({}) },
      { responseStream: true },
    )
    expect(response.statusCode).toBe(200)
    await new Promise((resolve) => setTimeout(resolve, 200))

    const error = await response
      .body!.bytes()
      .then(() => undefined)
      .catch((err: unknown) => err as Error)
    expect(error).toBeInstanceOf(RequestError)
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

async function sendWithBodyError(failure: Error): Promise<Error> {
  handler = (req) => {
    req.on('error', () => undefined)
    req.resume()
    // Never answers: the body failure is the only thing that can end this request.
  }
  const body: StreamLike = { read: (): Promise<Uint8Array | null> => Promise.reject(failure) }
  const error = await transport
    .send({ method: 'PUT', url: base + '/k', headers: createHeaderFields({}), body: streamBody(body) }, {})
    .then(() => undefined)
    .catch((err: unknown) => err as Error)
  return error!
}

function withCode(message: string, code: string): Error {
  const failure = new Error(message) as Error & { code?: string }
  failure.code = code
  return failure
}

describe('createNodeTransport error mapping', () => {
  it.each(['ECONNRESET', 'ECONNREFUSED', 'ETIMEDOUT', 'EPIPE', 'ENOTFOUND', 'EAI_AGAIN'])(
    'reports %s as a retryable RequestError',
    async (code) => {
      const failure = withCode('socket ' + code, code)
      const error = await sendWithBodyError(failure)
      expect(error).toBeInstanceOf(RequestError)
      expect((error as RequestError).cause).toBe(failure)
      expect(new ClientErrorRetryable().isErrorRetryable(error)).toBe(true)
    },
  )

  it.each(['CERT_HAS_EXPIRED', 'ERR_TLS_CERT_ALTNAME_INVALID', 'ERR_INVALID_ARG_TYPE'])(
    'leaves %s untouched and unretried',
    async (code) => {
      const failure = withCode('tls: ' + code, code)
      const error = await sendWithBodyError(failure)
      expect(error).toBe(failure)
      expect(new ClientErrorRetryable().isErrorRetryable(error)).toBe(false)
    },
  )
})

describe('createNodeTransport proxy', () => {
  it('routes through an http proxy and turns URL credentials into Proxy-Authorization', async () => {
    let seenUrl: string | undefined
    let seenAuth: string | undefined
    const proxy = createServer((req, res) => {
      seenUrl = req.url
      seenAuth = req.headers['proxy-authorization']
      req.resume()
      res.writeHead(200)
      res.end('via proxy')
    })
    await new Promise<void>((resolve) => proxy.listen(0, '127.0.0.1', resolve))
    const proxyPort = (proxy.address() as AddressInfo).port

    const proxied = createNodeTransport({ proxyHost: 'http://user:p%40ss@127.0.0.1:' + String(proxyPort) })
    try {
      const response = await proxied.send(
        { method: 'GET', url: 'http://oss-cn-hangzhou.example/bucket/key?acl', headers: createHeaderFields({}) },
        {},
      )
      expect(await response.body?.text()).toBe('via proxy')
      // The proxy sees the whole absolute URL, not just the path: an http target is forwarded, not tunnelled.
      expect(seenUrl).toBe('http://oss-cn-hangzhou.example/bucket/key?acl')
      // `p%40ss` is decoded to `p@ss` before it is Base64-encoded into the header.
      expect(seenAuth).toBe('Basic ' + Buffer.from('user:p@ss').toString('base64'))
    } finally {
      proxy.closeAllConnections()
      await new Promise<void>((resolve) => proxy.close(() => resolve()))
    }
  })
})

describe('createNodeTransport redirect', () => {
  // The Node transport does not follow redirects; `enabledRedirect` is a no-op.
  beforeEach(() => {
    handler = (req, res) => {
      req.resume()
      res.writeHead(302, { Location: base + '/final' })
      res.end()
    }
  })

  it('returns the 3xx as a response, never following it', async () => {
    const following = createNodeTransport({ enabledRedirect: true })
    const response = await following.send({ method: 'GET', url: base + '/redirect', headers: createHeaderFields({}) }, {})
    expect(response.statusCode).toBe(302)
    expect(response.headers.location).toBe(base + '/final')
    expect(requests).toBe(1)
  })
})

describe('createNodeTransport tls verification', () => {
  const key = `-----BEGIN PRIVATE KEY-----
MIIEvgIBADANBgkqhkiG9w0BAQEFAASCBKgwggSkAgEAAoIBAQDaLd1KAZgw3GTO
M9/lvHZNIMGuIklnj4QJKE0/pN2NzmXs1hur5cz1YtHOGvU53lBA7pd76Ef1AZQO
ZVL+bMufdAMEKeimd+/OXud5sDB+3o+lUpKqT9zWG36+p804iIzN0q8Eg/wB8aNK
apznaMbc7TNQtg0LMmdCNapByWTuSu6yStFl0TvqdIY/sCF86nBc2Ox5amrT4bCq
5rk14zqPWhmMqn4DhiqrlO5VD4z8onMmbV9cRsFPYw94G1W7gIV81scf/Ht2fx8o
opuAV+qa+16Uunm28kR9f9IYrwPuS/I95iPwRPyf7asUrKI9P/bLJqOVz8Fm0dAY
88gV2KRRAgMBAAECggEAHhKCn6/pk26FVyYE9IxN/WKISkv/3yODw6QHmxVKfmsW
VxcfOEnT6Xdl9hPMJ4jyJIkJCIijMReMbzwzEiOFIM947PV+fkImI8VRVXoIrSwD
E6VL1ugWxyIsuEhhESuXxh+F2nL7ZM8yvnqZxuGvwLAnHwxWGZbTGb1TitQgsna7
b1UKNPsiQz7qpi3BPY+JMaht202VCT59N4OLU1rEmNZfE3NPoZssZc6DmSlnaV4g
47W+peYZuLBV6xybVh+M7F4FQEDpykPjVQLH5M/K+OWRhgFeWEeDejA6WfU8J/7Y
3yceSQRKYaaDpyxTAG37RhgFHUY+dqODwwWkN+KJ6wKBgQDt7oH+sDu7zSPzqOVI
3tikJ/D9Av5h0UotpjnMmYUh4rB3V+i8QvvOsIGiKvSmqzEMxCTmXl4+R8ouVDiw
l8DlFaZS6k7MjSsh486RPmtVCgzGs5mDOuY8LhscOd6k1ff/gyVG2uoT+gd3f5RV
KYTCQhPEqFEVYbhFY54MS4XwNwKBgQDqv1wCsW1foEhyXR5S7b/CpCHfFIhbLDfG
j9Ye+oUVi2zofVfydiOqGb3kk6cTo+lHwyx8dZwBLBtgnqdNdWY409FvnZUaDiL/
A786HwSldGzvbwteBUTDCps8SCCwQ4Nl14YDOt7TL9ep9nZe61tPoFjBjyLUVQnB
KaF/nAz7twKBgQDqoa1n73q4dE/j1MZm2fthxlGL8AvTgoRYB/gvn6T+CYJj7jkA
jj2rUbxEo3+nbGJuaG7LDnx5hmoGzd8ppjz+rB7c3VrftMa4IOJvsNI/hi2bNTlJ
hCfPaNgrOZYpjyeEvVthSDhVgtciLJmmcc8NkgPUhveO0lLZeqc9EK0AeQKBgQCO
oa66RCv8ilr6gfHG2YZGMYwTC1q+auOI1iR3tifeq1SE/oPNYlLRK8rhc4V0vYck
f0YsaRlc7PvFfSCSQ97UcH80nj7WEfjZkeFC403jahY2dPYnLnRVPcCMpBaYgqz3
2DgpBkAVeWBEeOf7TG2yt+61zM6QzQqcPztNWffZiQKBgE3FJZcsMWiOg8Us554D
fC6VjZKJw5sX2PGvfOItDGMsNwq8BsYm/Oy31UMI0V0AkFr02poNZ1ms8fprnS9o
GCWxu8q5qbCY8IACf6AtuWf0rZTcbOBLEgLGqT7k3QYZaanSTpzL6bHqZ8OgC7s5
V52iL1KtjlXNiynBgC1vFSS1
-----END PRIVATE KEY-----`
  const cert = `-----BEGIN CERTIFICATE-----
MIIDHDCCAgSgAwIBAgIUEpSSdM/A+MlJomLC+6rzFuwWAcQwDQYJKoZIhvcNAQEL
BQAwFDESMBAGA1UEAwwJMTI3LjAuMC4xMCAXDTI2MDkxMTExNTM1NloYDzIxMjYw
ODE4MTE1MzU2WjAUMRIwEAYDVQQDDAkxMjcuMC4wLjEwggEiMA0GCSqGSIb3DQEB
AQUAA4IBDwAwggEKAoIBAQDaLd1KAZgw3GTOM9/lvHZNIMGuIklnj4QJKE0/pN2N
zmXs1hur5cz1YtHOGvU53lBA7pd76Ef1AZQOZVL+bMufdAMEKeimd+/OXud5sDB+
3o+lUpKqT9zWG36+p804iIzN0q8Eg/wB8aNKapznaMbc7TNQtg0LMmdCNapByWTu
Su6yStFl0TvqdIY/sCF86nBc2Ox5amrT4bCq5rk14zqPWhmMqn4DhiqrlO5VD4z8
onMmbV9cRsFPYw94G1W7gIV81scf/Ht2fx8oopuAV+qa+16Uunm28kR9f9IYrwPu
S/I95iPwRPyf7asUrKI9P/bLJqOVz8Fm0dAY88gV2KRRAgMBAAGjZDBiMB0GA1Ud
DgQWBBSE89JDk9R+31OvjRgstTu56yXl5jAfBgNVHSMEGDAWgBSE89JDk9R+31Ov
jRgstTu56yXl5jAPBgNVHRMBAf8EBTADAQH/MA8GA1UdEQQIMAaHBH8AAAEwDQYJ
KoZIhvcNAQELBQADggEBAGQEEMRJAkn9XC7LgK16U76azUr5R7B5DSDzqT4NJjgA
mmVvBgoTvfHodwk9gt6Xr/C0liwBbyQ+wgGOHcD1vmoKxcwUHdR0GqZBq85aAS21
JN6Gqe00DbBYVK7hrh0qA0jSHd+Pga5OGUHfe9quxqT/4+LVc2NGVRZyfDpPmGdm
JXqyvzq6XfQpPiz3mJfzuUWqCXXZEN7zKGel4qGrJwyWga85z5iHTW6UZTuw4R/m
fI1a/hedcuuhYC1rBMY0zk3R9qUXnWlI/cVgS7HUKOdfvyYNMUKuJ+KuIz91E+yx
LLgmZIvFzEv09kLvlI/JSaYuY0NGmCBocylUmKPOQU0=
-----END CERTIFICATE-----`

  let tls: HttpsServer
  let tlsBase: string

  beforeAll(async () => {
    tls = createHttpsServer({ key, cert }, (req, res) => {
      req.resume()
      res.writeHead(200)
      res.end('secure')
    })
    await new Promise<void>((resolve) => tls.listen(0, '127.0.0.1', resolve))
    tlsBase = 'https://127.0.0.1:' + String((tls.address() as AddressInfo).port)
  })

  afterAll(async () => {
    await new Promise<void>((resolve, reject) => {
      tls.close((err) => (err ? reject(err) : resolve()))
    })
  })

  it('rejects a self-signed certificate by default', async () => {
    const error = await transport
      .send({ method: 'GET', url: tlsBase + '/k', headers: createHeaderFields({}) }, {})
      .then(() => undefined)
      .catch((err: unknown) => err as Error & { code?: string })
    expect(error).toBeDefined()
    expect(String(error?.code)).toContain('CERT')
  })

  it('accepts a self-signed certificate when insecureSkipVerify is set', async () => {
    const insecure = createNodeTransport({ insecureSkipVerify: true })
    const response = await insecure.send({ method: 'GET', url: tlsBase + '/k', headers: createHeaderFields({}) }, {})
    expect(response.statusCode).toBe(200)
    expect(await response.body?.text()).toBe('secure')
  })
})

describe('BodyTap', () => {
  async function pump(tap: BodyTap, chunks: string[]): Promise<string> {
    const out: Buffer[] = []
    tap.on('data', (chunk: Buffer) => out.push(chunk))
    const done = new Promise<void>((resolve) => tap.on('end', resolve))
    for (const chunk of chunks) tap.write(utf8Encode(chunk))
    tap.end()
    await done
    return Buffer.concat(out).toString('utf8')
  }

  it('forwards every chunk unchanged when no observer is attached', async () => {
    expect(await pump(new BodyTap(), ['alpha', 'beta', 'gamma'])).toBe('alphabetagamma')
  })

  it('shows the observer each chunk while still passing it through', async () => {
    const seenChunks: string[] = []
    const tap = new BodyTap((chunk) => seenChunks.push(utf8Decode(chunk)))
    const forwarded = await pump(tap, ['one', 'two', 'three'])

    expect(forwarded).toBe('onetwothree')
    expect(seenChunks).toEqual(['one', 'two', 'three'])
  })
})

describe('createNodeTransport progress', () => {
  it('reports a Uint8Array body as one increment of its byte length', async () => {
    const seenIncrements: number[] = []
    await transport.send(
      { method: 'PUT', url: base + '/bucket/key', headers: createHeaderFields({}), body: bytesBody(utf8Encode('hello bytes')) },
      { progressReporter: (increment) => seenIncrements.push(increment) },
    )

    expect(seenIncrements).toEqual([11])
    // The whole-body send still lets node derive the length.
    expect(seen?.headers['content-length']).toBe('11')
  })

  it('reports a string body by its utf-8 byte length, not its character count', async () => {
    const seenIncrements: number[] = []
    await transport.send(
      { method: 'PUT', url: base + '/bucket/key', headers: createHeaderFields({}), body: stringBody('键值') },
      { progressReporter: (increment) => seenIncrements.push(increment) },
    )

    // Two CJK characters, three utf-8 bytes each.
    expect(seenIncrements).toEqual([6])
  })

  it('reports a streamed body one increment per chunk', async () => {
    const chunks = ['alpha', 'beta', 'gamma']
    let at = 0
    const body: StreamLike = {
      read: (): Promise<Uint8Array | null> => Promise.resolve(at < chunks.length ? utf8Encode(chunks[at++]) : null),
    }
    const seenIncrements: number[] = []

    await transport.send(
      { method: 'PUT', url: base + '/bucket/key', headers: createHeaderFields({}), body: streamBody(body) },
      { progressReporter: (increment) => seenIncrements.push(increment) },
    )

    expect(seenIncrements).toEqual([5, 4, 5])
  })
})

describe('createNodeTransport platform', () => {
  it('reports a platform string in the User-Agent format', () => {
    // `<os>/-/<arch>;node<version>`, e.g. `darwin/-/arm64;node20.11.0`.
    expect(createNodeTransport().platform).toMatch(/^[a-z0-9]+\/-\/[a-z0-9]+;node\d+\.\d+\.\d+/)
  })

  it('can stream the request body: node reads it incrementally', () => {
    expect(createNodeTransport().canStreamUpload).toBe(true)
  })
})

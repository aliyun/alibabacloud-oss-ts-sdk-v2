import { describe, expect, it } from 'vitest'
import { Client } from '../../../src/client.js'
import { ObjectFileHandle, OssFs } from '../../../src/runtime/node/fs.js'
import { StaticCredentialsProvider } from '../../../src/credentials/index.js'
import { bytesBody } from '../../fixtures/mock-transport.js'
import type { RequestMessage, RequestOptions } from '../../../src/transport/types.js'

interface MockResponse {
  statusCode?: number
  status?: string
  headers?: Record<string, string>
  body?: Uint8Array
}

function ossClient(responses: MockResponse[]) {
  const requests: RequestMessage[] = []
  const sendOptions: RequestOptions[] = []
  let at = 0

  const transport = {
    requests,
    sendOptions,
    send: (request: RequestMessage, opts: RequestOptions) => {
      requests.push(request)
      sendOptions.push(opts)
      const canned = responses[Math.min(at, responses.length - 1)]
      at += 1

      const headers = { ...(canned.headers ?? {}) }
      let body = canned.body

      // For GET requests, honor the Range header and slice the body.
      if (request.method === 'GET' && body !== undefined) {
        const range = request.headers.get('range')
        if (range !== undefined && range.startsWith('bytes=')) {
          const match = range.slice(6).match(/^(\d+)-(\d+)?$/)
          if (match) {
            const start = parseInt(match[1], 10)
            const end = match[2] !== undefined ? parseInt(match[2], 10) : body.byteLength - 1
            const sliced = body.subarray(start, Math.min(end + 1, body.byteLength))
            headers['content-range'] = `bytes ${start}-${start + sliced.byteLength - 1}/${body.byteLength}`
            body = sliced
          }
        }
      }

      return Promise.resolve({
        status: canned.status ?? 'OK',
        statusCode: canned.statusCode ?? 200,
        headers,
        body: body === undefined ? undefined : bytesBody(body),
      })
    },
  }

  return {
    client: new Client(
      {
        endpoint: 'http://oss-cn-hangzhou.aliyuncs.com',
        region: 'cn-hangzhou',
        credentialsProvider: new StaticCredentialsProvider('ak', 'sk'),
      },
      (options) => {
        options.transport = transport
      },
    ),
    transport,
  }
}

function headResponse(size: number, extra: Record<string, string> = {}): { statusCode: number; headers: Record<string, string> } {
  return {
    statusCode: 200,
    headers: {
      'content-length': String(size),
      'content-type': 'application/octet-stream',
      etag: '"etag"',
      'last-modified': 'Fri, 01 Jan 2026 00:00:00 GMT',
      ...extra,
    },
  }
}

function headResponseWithoutContentLength(extra: Record<string, string> = {}): { statusCode: number; headers: Record<string, string> } {
  return {
    statusCode: 200,
    headers: {
      'content-type': 'application/octet-stream',
      etag: '"etag"',
      'last-modified': 'Fri, 01 Jan 2026 00:00:00 GMT',
      ...extra,
    },
  }
}

function getObjectMetaResponse(size: number, extra: Record<string, string> = {}): { statusCode: number; headers: Record<string, string> } {
  return {
    statusCode: 200,
    headers: {
      'content-length': String(size),
      etag: '"etag"',
      'last-modified': 'Fri, 01 Jan 2026 00:00:00 GMT',
      ...extra,
    },
  }
}

function objectBytes(text: string): Uint8Array {
  return new TextEncoder().encode(text)
}

function concatBytes(chunks: Uint8Array[]): Uint8Array {
  const total = chunks.reduce((sum, c) => sum + c.byteLength, 0)
  const result = new Uint8Array(total)
  let offset = 0
  for (const chunk of chunks) {
    result.set(chunk, offset)
    offset += chunk.byteLength
  }
  return result
}

describe('ReadOnlyFileHandle', () => {
  it('opens and returns stats', async () => {
    const { client } = ossClient([headResponse(42)])
    const fs = new OssFs(client)
    const handle = await fs.openReadOnly('bucket', 'key')

    const info = await handle.stat()
    expect(info.name).toBe('oss://bucket/key')
    expect(info.size).toBe(42)
    expect(info.contentType).toBe('application/octet-stream')
    expect(info.etag).toBe('"etag"')

    await handle.close()
  })

  it('sends accept-encoding identity on HeadObject to avoid chunked responses', async () => {
    const { client, transport } = ossClient([headResponse(42)])
    const fs = new OssFs(client)
    const handle = await fs.openReadOnly('bucket', 'key')

    await handle.stat()

    const head = transport.requests.find((r) => r.method === 'HEAD')
    expect(head?.headers.get('accept-encoding')).toBe('identity')

    await handle.close()
  })

  it('falls back to GetObjectMeta when HeadObject lacks Content-Length', async () => {
    const { client, transport } = ossClient([
      headResponseWithoutContentLength(),
      getObjectMetaResponse(42),
    ])
    const fs = new OssFs(client)
    const handle = await fs.openReadOnly('bucket', 'key')

    const info = await handle.stat()
    expect(info.size).toBe(42)
    expect(info.contentType).toBe('application/octet-stream')
    expect(info.etag).toBe('"etag"')

    const heads = transport.requests.filter((r) => r.method === 'HEAD')
    expect(heads).toHaveLength(2)
    expect(heads[1].url).toContain('objectMeta')

    await handle.close()
  })

  it('reports its name and closed state, with the requested versionId', async () => {
    const { client } = ossClient([headResponse(0)])
    const fs = new OssFs(client)
    const handle = await fs.openReadOnly('bucket', 'key', { versionId: '123' })

    expect(handle).toBeInstanceOf(ObjectFileHandle)
    expect(handle.name).toBe('oss://bucket/key?versionId=123')
    expect(handle.closed).toBe(false)

    const info = await handle.stat()
    expect(info.name).toBe('oss://bucket/key?versionId=123')

    await handle.close()
    expect(handle.closed).toBe(true)
  })

  it('reads from the current cursor and advances it', async () => {
    const data = objectBytes('hello world')
    const { client, transport } = ossClient([headResponse(data.byteLength), { body: data }])
    const fs = new OssFs(client)
    const handle = await fs.openReadOnly('bucket', 'key')

    const buf = new Uint8Array(64)
    const r1 = await handle.read(buf, 0, 5)
    expect(r1.bytesRead).toBe(5)
    expect(new TextDecoder().decode(buf.subarray(0, 5))).toBe('hello')

    const r2 = await handle.read(buf, 0, 5)
    expect(r2.bytesRead).toBe(5)
    expect(new TextDecoder().decode(buf.subarray(0, 5))).toBe(' worl')

    const r3 = await handle.read(buf, 0, 5)
    expect(r3.bytesRead).toBe(1)
    expect(buf[0]).toBe('d'.charCodeAt(0))

    const r4 = await handle.read(buf, 0, 5)
    expect(r4.bytesRead).toBe(0)

    const getRequests = transport.requests.filter((r) => r.method === 'GET')
    expect(getRequests).toHaveLength(3)
    expect(getRequests[0].headers.get('range')).toBe('bytes=0-4')
    expect(getRequests[1].headers.get('range')).toBe('bytes=5-9')
    expect(getRequests[2].headers.get('range')).toBe('bytes=10-10')

    await handle.close()
  })

  it('reads from a given position without moving the cursor', async () => {
    const data = objectBytes('hello world')
    const { client, transport } = ossClient([headResponse(data.byteLength), { body: data }, { body: data }])
    const fs = new OssFs(client)
    const handle = await fs.openReadOnly('bucket', 'key')

    const buf = new Uint8Array(64)
    const r1 = await handle.read(buf, 0, 5, 6)
    expect(r1.bytesRead).toBe(5)
    expect(new TextDecoder().decode(buf.subarray(0, 5))).toBe('world')

    // Cursor is still at 0, so the next read without position starts from 0
    const r2 = await handle.read(buf, 0, 5)
    expect(r2.bytesRead).toBe(5)
    expect(new TextDecoder().decode(buf.subarray(0, 5))).toBe('hello')

    const getRequests = transport.requests.filter((r) => r.method === 'GET')
    expect(getRequests[0].headers.get('range')).toBe('bytes=6-10')
    expect(getRequests[1].headers.get('range')).toBe('bytes=0-4')

    await handle.close()
  })

  it('supports the options object form', async () => {
    const data = objectBytes('hello world')
    const { client, transport } = ossClient([headResponse(data.byteLength), { body: data }])
    const fs = new OssFs(client)
    const handle = await fs.openReadOnly('bucket', 'key')

    const buf = new Uint8Array(64)
    const { bytesRead } = await handle.read({ buffer: buf, offset: 0, length: 5, position: 0 })
    expect(bytesRead).toBe(5)
    expect(new TextDecoder().decode(buf.subarray(0, 5))).toBe('hello')

    expect(transport.requests.some((r) => r.method === 'GET' && r.headers.get('range') === 'bytes=0-4')).toBe(true)

    await handle.close()
  })

  it('uses the initial offset as the cursor start', async () => {
    const data = objectBytes('hello world')
    const { client, transport } = ossClient([headResponse(data.byteLength), { body: data }])
    const fs = new OssFs(client)
    const handle = await fs.openReadOnly('bucket', 'key', { offset: 6 })

    const buf = new Uint8Array(64)
    const { bytesRead } = await handle.read(buf, 0, 5)
    expect(bytesRead).toBe(5)
    expect(new TextDecoder().decode(buf.subarray(0, 5))).toBe('world')

    expect(transport.requests.find((r) => r.method === 'GET')?.headers.get('range')).toBe('bytes=6-10')

    await handle.close()
  })

  it('accepts the object form of openReadOnly', async () => {
    const data = objectBytes('hello world')
    const { client, transport } = ossClient([headResponse(data.byteLength), { body: data }])
    const fs = new OssFs(client)
    const handle = await fs.openReadOnly({ bucket: 'bucket', key: 'key', offset: 6 })

    const buf = new Uint8Array(64)
    const { bytesRead } = await handle.read(buf, 0, 5)
    expect(bytesRead).toBe(5)
    expect(new TextDecoder().decode(buf.subarray(0, 5))).toBe('world')
    expect(transport.requests.find((r) => r.method === 'GET')?.headers.get('range')).toBe('bytes=6-10')

    await handle.close()
  })

  it('applies nested operation options to every request', async () => {
    const data = objectBytes('hi')
    const { client, transport } = ossClient([headResponse(data.byteLength), { body: data }])
    const fs = new OssFs(client)
    const controller = new AbortController()
    const handle = await fs.openReadOnly('bucket', 'key', {
      operation: { retryMaxAttempts: 3, readWriteTimeoutMs: 5_000, signal: controller.signal },
    })

    await handle.read(new Uint8Array(2), 0, 2)

    expect(transport.sendOptions).toHaveLength(2)
    for (const options of transport.sendOptions) {
      expect(options.readWriteTimeoutMs).toBe(5_000)
      expect(options.signal).toBeInstanceOf(AbortSignal)
    }

    await handle.close()
  })

  it('throws when reading from a closed handle', async () => {
    const { client } = ossClient([headResponse(10)])
    const fs = new OssFs(client)
    const handle = await fs.openReadOnly('bucket', 'key')
    await handle.close()

    await expect(handle.read(new Uint8Array(10))).rejects.toThrow('ReadOnlyFileHandle is closed')
  })

  it('throws on invalid offset or length', async () => {
    const { client } = ossClient([headResponse(10)])
    const fs = new OssFs(client)
    const handle = await fs.openReadOnly('bucket', 'key')

    await expect(handle.read(new Uint8Array(10), -1, 5)).rejects.toThrow('Invalid offset or length')
    await expect(handle.read(new Uint8Array(10), 0, 15)).rejects.toThrow('Invalid offset or length')
    await expect(handle.read(new Uint8Array(10), 8, 5)).rejects.toThrow('Invalid offset or length')

    await handle.close()
  })

  it('throws on out-of-range position', async () => {
    const { client } = ossClient([headResponse(10)])
    const fs = new OssFs(client)
    const handle = await fs.openReadOnly('bucket', 'key')

    await expect(handle.read(new Uint8Array(10), 0, 5, 20)).rejects.toThrow('Position out of range')
    await expect(handle.read(new Uint8Array(10), 0, 5, -1)).rejects.toThrow('Position out of range')

    await handle.close()
  })

  it('passes versionId and requestPayer through requests', async () => {
    const data = objectBytes('hello')
    const { client, transport } = ossClient([headResponse(5), { body: data }])
    const fs = new OssFs(client)
    const handle = await fs.openReadOnly('bucket', 'key', {
      versionId: '123',
      requestPayer: 'payer',
    })

    const buf = new Uint8Array(64)
    await handle.read(buf, 0, 5, 0)

    const head = transport.requests.find((r) => r.method === 'HEAD')
    const get = transport.requests.find((r) => r.method === 'GET')

    expect(head?.url).toContain('versionId=123')
    expect(head?.headers.get('x-oss-request-payer')).toBe('payer')
    expect(get?.url).toContain('versionId=123')
    expect(get?.headers.get('x-oss-request-payer')).toBe('payer')

    await handle.close()
  })

  it('createReadStream reads the whole object', async () => {
    const data = objectBytes('hello world')
    const { client, transport } = ossClient([headResponse(data.byteLength), { body: data }])
    const fs = new OssFs(client)
    const handle = await fs.openReadOnly('bucket', 'key')

    const stream = await handle.createReadStream()
    const chunks: Uint8Array[] = []
    for await (const chunk of stream) {
      chunks.push(chunk as Uint8Array)
    }

    const total = chunks.reduce((sum, c) => sum + c.byteLength, 0)
    expect(total).toBe(data.byteLength)
    expect(new TextDecoder().decode(concatBytes(chunks))).toBe('hello world')

    const ranges = transport.requests.filter((r) => r.method === 'GET').map((r) => r.headers.get('range'))
    expect(ranges).toHaveLength(1)
    expect(ranges[0]).toBe('bytes=0-10')
  })

  it('createReadStream respects start and end', async () => {
    const data = objectBytes('hello world')
    const { client, transport } = ossClient([headResponse(data.byteLength), { body: data }])
    const fs = new OssFs(client)
    const handle = await fs.openReadOnly('bucket', 'key')

    const stream = await handle.createReadStream({ start: 6, end: 8 })
    const chunks: Uint8Array[] = []
    for await (const chunk of stream) {
      chunks.push(chunk as Uint8Array)
    }

    expect(new TextDecoder().decode(concatBytes(chunks))).toBe('wor')

    const ranges = transport.requests.filter((r) => r.method === 'GET').map((r) => r.headers.get('range'))
    expect(ranges).toHaveLength(1)
    expect(ranges[0]).toBe('bytes=6-8')
  })

  it('createReadStream passes the response body through without prefetch', async () => {
    const data = objectBytes('0123456789')
    const { client, transport } = ossClient([headResponse(data.byteLength), { body: data }])
    const fs = new OssFs(client)
    const handle = await fs.openReadOnly('bucket', 'key')

    const stream = await handle.createReadStream({ highWaterMark: 3 })
    const chunks: Uint8Array[] = []
    for await (const chunk of stream) {
      chunks.push(chunk as Uint8Array)
    }

    expect(new TextDecoder().decode(concatBytes(chunks))).toBe('0123456789')

    const ranges = transport.requests.filter((r) => r.method === 'GET').map((r) => r.headers.get('range'))
    expect(ranges).toEqual(['bytes=0-9'])
  })

  it('readableWebStream reads the whole object', async () => {
    const data = objectBytes('hello world')
    const { client, transport } = ossClient([headResponse(data.byteLength), { body: data }])
    const fs = new OssFs(client)
    const handle = await fs.openReadOnly('bucket', 'key')

    const webStream = await handle.readableWebStream()
    const chunks: Uint8Array[] = []
    const reader = webStream.getReader()
    while (true) {
      const { value, done } = await reader.read()
      if (done) break
      chunks.push(value)
    }

    const total = chunks.reduce((sum, c) => sum + c.byteLength, 0)
    expect(total).toBe(data.byteLength)
    expect(new TextDecoder().decode(concatBytes(chunks))).toBe('hello world')

    const ranges = transport.requests.filter((r) => r.method === 'GET').map((r) => r.headers.get('range'))
    expect(ranges).toHaveLength(1)
    expect(ranges[0]).toBe('bytes=0-10')
  })

  it('readableWebStream respects start and end', async () => {
    const data = objectBytes('hello world')
    const { client, transport } = ossClient([headResponse(data.byteLength), { body: data }])
    const fs = new OssFs(client)
    const handle = await fs.openReadOnly('bucket', 'key')

    const webStream = await handle.readableWebStream({ start: 6, end: 8 })
    const chunks: Uint8Array[] = []
    const reader = webStream.getReader()
    while (true) {
      const { value, done } = await reader.read()
      if (done) break
      chunks.push(value)
    }

    expect(new TextDecoder().decode(concatBytes(chunks))).toBe('wor')

    const ranges = transport.requests.filter((r) => r.method === 'GET').map((r) => r.headers.get('range'))
    expect(ranges).toHaveLength(1)
    expect(ranges[0]).toBe('bytes=6-8')
  })

  it('readableWebStream passes the response body through without prefetch', async () => {
    const data = objectBytes('0123456789')
    const { client, transport } = ossClient([headResponse(data.byteLength), { body: data }])
    const fs = new OssFs(client)
    const handle = await fs.openReadOnly('bucket', 'key')

    const webStream = await handle.readableWebStream({ highWaterMark: 3 })
    const chunks: Uint8Array[] = []
    const reader = webStream.getReader()
    while (true) {
      const { value, done } = await reader.read()
      if (done) break
      chunks.push(value)
    }

    expect(new TextDecoder().decode(concatBytes(chunks))).toBe('0123456789')

    const ranges = transport.requests.filter((r) => r.method === 'GET').map((r) => r.headers.get('range'))
    expect(ranges).toEqual(['bytes=0-9'])
  })

  it('createReadStream resumes from the last byte after a disconnect', async () => {
    const data = objectBytes('hello world')
    const getRequests: RequestMessage[] = []
    let getCount = 0

    const transport = {
      send: (request: RequestMessage) => {
        if (request.method === 'HEAD') {
          return Promise.resolve({
            status: 'OK',
            statusCode: 200,
            headers: headResponse(data.byteLength).headers,
            body: undefined,
          })
        }
        getRequests.push(request)
        getCount += 1
        const range = request.headers.get('range')
        if (getCount === 1) {
          return Promise.resolve({
            status: 'Partial Content',
            statusCode: 206,
            headers: { 'content-range': `bytes 0-${data.byteLength - 1}/${data.byteLength}` },
            body: {
              bytes: () => Promise.reject(new Error('bytes() must not be called')),
              text: () => Promise.reject(new Error('text() must not be called')),
              stream: () => {
                let sent = false
                return {
                  read: () => {
                    if (sent) return Promise.reject(new Error('connection reset'))
                    sent = true
                    return Promise.resolve(objectBytes('hello'))
                  },
                  cancel: () => {},
                }
              },
              cancel: () => {},
            },
          })
        }
        const start = range !== undefined && range.startsWith('bytes=')
          ? parseInt(range.slice(6).split('-')[0], 10)
          : 0
        const tail = data.subarray(start)
        return Promise.resolve({
          status: 'Partial Content',
          statusCode: 206,
          headers: { 'content-range': `bytes ${start}-${data.byteLength - 1}/${data.byteLength}` },
          body: {
            bytes: () => Promise.reject(new Error('bytes() must not be called')),
            text: () => Promise.reject(new Error('text() must not be called')),
            stream: () => {
              let sent = false
              return {
                read: () => {
                  if (sent) return Promise.resolve(null)
                  sent = true
                  return Promise.resolve(tail)
                },
                cancel: () => {},
              }
            },
            cancel: () => {},
          },
        })
      },
    }

    const client = new Client(
      {
        endpoint: 'http://oss-cn-hangzhou.aliyuncs.com',
        region: 'cn-hangzhou',
        credentialsProvider: new StaticCredentialsProvider('ak', 'sk'),
      },
      (options) => {
        options.transport = transport
      },
    )
    const fs = new OssFs(client)
    const handle = await fs.openReadOnly('bucket', 'key')

    const stream = await handle.createReadStream()
    const chunks: Uint8Array[] = []
    for await (const chunk of stream) {
      chunks.push(chunk as Uint8Array)
    }

    expect(new TextDecoder().decode(concatBytes(chunks))).toBe('hello world')

    const ranges = getRequests.map((r) => r.headers.get('range'))
    expect(ranges).toEqual(['bytes=0-10', 'bytes=5-10'])
  })

  it('createReadStream retries indefinitely on stream read errors', async () => {
    const data = objectBytes('hello world')
    const getRequests: RequestMessage[] = []
    let getCount = 0

    const transport = {
      send: (request: RequestMessage) => {
        if (request.method === 'HEAD') {
          return Promise.resolve({
            status: 'OK',
            statusCode: 200,
            headers: headResponse(data.byteLength).headers,
            body: undefined,
          })
        }
        getRequests.push(request)
        getCount += 1
        const range = request.headers.get('range')
        const start = range !== undefined && range.startsWith('bytes=')
          ? parseInt(range.slice(6).split('-')[0], 10)
          : 0

        // First two attempts fail after returning one byte each; third succeeds.
        const failAfter = getCount <= 2 ? 1 : undefined
        const tail = data.subarray(start)
        return Promise.resolve({
          status: 'Partial Content',
          statusCode: 206,
          headers: { 'content-range': `bytes ${start}-${data.byteLength - 1}/${data.byteLength}` },
          body: {
            bytes: () => Promise.reject(new Error('bytes() must not be called')),
            text: () => Promise.reject(new Error('text() must not be called')),
            stream: () => {
              let sent = 0
              return {
                read: () => {
                  if (failAfter !== undefined && sent >= failAfter) {
                    return Promise.reject(new Error('connection reset'))
                  }
                  if (sent >= tail.byteLength) return Promise.resolve(null)
                  const chunk = tail.subarray(sent, sent + 1)
                  sent += 1
                  return Promise.resolve(chunk)
                },
                cancel: () => {},
              }
            },
            cancel: () => {},
          },
        })
      },
    }

    const client = new Client(
      {
        endpoint: 'http://oss-cn-hangzhou.aliyuncs.com',
        region: 'cn-hangzhou',
        credentialsProvider: new StaticCredentialsProvider('ak', 'sk'),
      },
      (options) => {
        options.transport = transport
      },
    )
    const fs = new OssFs(client)
    const handle = await fs.openReadOnly('bucket', 'key')

    const stream = await handle.createReadStream()
    const chunks: Uint8Array[] = []
    for await (const chunk of stream) {
      chunks.push(chunk as Uint8Array)
    }

    expect(new TextDecoder().decode(concatBytes(chunks))).toBe('hello world')

    const ranges = getRequests.map((r) => r.headers.get('range'))
    expect(ranges).toEqual(['bytes=0-10', 'bytes=1-10', 'bytes=2-10'])
  })

  it('createReadStream gives up when the GetObject request fails', async () => {
    const data = objectBytes('hello world')
    const getRequests: RequestMessage[] = []

    const transport = {
      send: (request: RequestMessage) => {
        if (request.method === 'HEAD') {
          return Promise.resolve({
            status: 'OK',
            statusCode: 200,
            headers: headResponse(data.byteLength).headers,
            body: undefined,
          })
        }
        getRequests.push(request)
        return Promise.reject(new Error('GetObject request failed'))
      },
    }

    const client = new Client(
      {
        endpoint: 'http://oss-cn-hangzhou.aliyuncs.com',
        region: 'cn-hangzhou',
        credentialsProvider: new StaticCredentialsProvider('ak', 'sk'),
      },
      (options) => {
        options.transport = transport
      },
    )
    const fs = new OssFs(client)
    const handle = await fs.openReadOnly('bucket', 'key')

    const stream = await handle.createReadStream()
    await expect(async () => {
      for await (const chunk of stream) {
        void chunk
      }
    }).rejects.toThrow('GetObject request failed')

    expect(getRequests).toHaveLength(1)
  })

  it('autoClose closes the handle when the stream ends', async () => {
    const data = objectBytes('hello')
    const { client } = ossClient([headResponse(data.byteLength), { body: data }])
    const fs = new OssFs(client)
    const handle = await fs.openReadOnly('bucket', 'key')

    const stream = await handle.createReadStream()
    const chunks: Uint8Array[] = []
    for await (const chunk of stream) {
      chunks.push(chunk as Uint8Array)
    }

    await expect(handle.read(new Uint8Array(1))).rejects.toThrow('ReadOnlyFileHandle is closed')
  })

  it('throws when creating a stream from a closed handle', async () => {
    const { client } = ossClient([headResponse(10)])
    const fs = new OssFs(client)
    const handle = await fs.openReadOnly('bucket', 'key')
    await handle.close()

    await expect(handle.createReadStream()).rejects.toThrow('ReadOnlyFileHandle is closed')
    await expect(handle.readableWebStream()).rejects.toThrow('ReadOnlyFileHandle is closed')
  })

  it('reads through the response stream rather than buffering the whole body', async () => {
    const data = objectBytes('hello world')
    let streamCalls = 0
    let cancelCalls = 0

    const transport = {
      send: (request: RequestMessage) => {
        if (request.method === 'HEAD') {
          return Promise.resolve({
            status: 'OK',
            statusCode: 200,
            headers: headResponse(data.byteLength).headers,
            body: undefined,
          })
        }
        return Promise.resolve({
          status: 'Partial Content',
          statusCode: 206,
          headers: { 'content-length': String(data.byteLength) },
          body: {
            bytes: () => Promise.reject(new Error('bytes() must not be called')),
            text: () => Promise.reject(new Error('text() must not be called')),
            stream: () => {
              streamCalls += 1
              let sent = false
              return {
                read: () => {
                  if (sent) return Promise.resolve(null)
                  sent = true
                  return Promise.resolve(data)
                },
              }
            },
            cancel: () => {
              cancelCalls += 1
            },
          },
        })
      },
    }

    const client = new Client(
      {
        endpoint: 'http://oss-cn-hangzhou.aliyuncs.com',
        region: 'cn-hangzhou',
        credentialsProvider: new StaticCredentialsProvider('ak', 'sk'),
      },
      (options) => {
        options.transport = transport
      },
    )
    const fs = new OssFs(client)
    const handle = await fs.openReadOnly('bucket', 'key')

    const buf = new Uint8Array(64)
    const { bytesRead } = await handle.read(buf, 0, 5, 0)
    expect(bytesRead).toBe(5)
    expect(new TextDecoder().decode(buf.subarray(0, 5))).toBe('hello')
    expect(streamCalls).toBe(1)
    expect(cancelCalls).toBe(1)

    await handle.close()
  })

  it('createReadStream with enablePrefetch issues prefetchNum concurrent requests', async () => {
    const data = objectBytes('012345')
    const { client, transport } = ossClient([headResponse(data.byteLength), { body: data }])
    const fs = new OssFs(client)
    const handle = await fs.openReadOnly('bucket', 'key')

    const stream = await handle.createReadStream({ enablePrefetch: true, prefetchNum: 3, chunkSize: 2 })
    const chunks: Uint8Array[] = []
    for await (const chunk of stream) {
      chunks.push(chunk as Uint8Array)
      if (chunks.length === 1) break
    }

    const ranges = transport.requests.filter((r) => r.method === 'GET').map((r) => r.headers.get('range'))
    expect(ranges).toEqual(['bytes=0-1', 'bytes=2-3', 'bytes=4-5'])
  })

  it('readableWebStream with enablePrefetch delivers chunks in order', async () => {
    const data = objectBytes('012345')
    const { client, transport } = ossClient([headResponse(data.byteLength), { body: data }])
    const fs = new OssFs(client)
    const handle = await fs.openReadOnly('bucket', 'key')

    const webStream = await handle.readableWebStream({ enablePrefetch: true, prefetchNum: 3, chunkSize: 2 })
    const chunks: Uint8Array[] = []
    const reader = webStream.getReader()
    while (true) {
      const { value, done } = await reader.read()
      if (done) break
      chunks.push(value)
      if (chunks.length === 1) break
    }

    const ranges = transport.requests.filter((r) => r.method === 'GET').map((r) => r.headers.get('range'))
    expect(ranges).toEqual(['bytes=0-1', 'bytes=2-3', 'bytes=4-5'])
    expect(new TextDecoder().decode(concatBytes(chunks))).toBe('01')
  })

  it('readableWebStream with prefetch delivers highWaterMark-sized pieces', async () => {
    const data = objectBytes('0123456789')
    const { client, transport } = ossClient([headResponse(data.byteLength), { body: data }])
    const fs = new OssFs(client)
    const handle = await fs.openReadOnly('bucket', 'key')

    const webStream = await handle.readableWebStream({
      enablePrefetch: true,
      prefetchNum: 2,
      chunkSize: 4,
      highWaterMark: 3,
    })
    const chunks: Uint8Array[] = []
    const reader = webStream.getReader()
    while (true) {
      const { value, done } = await reader.read()
      if (done) break
      chunks.push(value)
    }

    expect(chunks.map((c) => c.byteLength)).toEqual([3, 1, 3, 1, 2])
    expect(new TextDecoder().decode(concatBytes(chunks))).toBe('0123456789')

    const ranges = transport.requests.filter((r) => r.method === 'GET').map((r) => r.headers.get('range'))
    expect(ranges).toEqual(['bytes=0-3', 'bytes=4-7', 'bytes=8-9'])
  })

  it('prefetch writes response streams into slots instead of buffering the body', async () => {
    const data = objectBytes('012345')
    let bytesCalls = 0
    let streamCalls = 0

    const transport = {
      send: (request: RequestMessage) => {
        if (request.method === 'HEAD') {
          return Promise.resolve({
            status: 'OK',
            statusCode: 200,
            headers: headResponse(data.byteLength).headers,
            body: undefined,
          })
        }
        const range = request.headers.get('range') ?? ''
        const start = parseInt(range.slice(6).split('-')[0], 10)
        const end = parseInt(range.slice(6).split('-')[1], 10)
        const slice = data.subarray(start, end + 1)
        return Promise.resolve({
          status: 'Partial Content',
          statusCode: 206,
          headers: { 'content-range': `bytes ${start}-${end}/${data.byteLength}` },
          body: {
            bytes: () => {
              bytesCalls += 1
              return Promise.reject(new Error('bytes() must not be called'))
            },
            text: () => Promise.reject(new Error('text() must not be called')),
            stream: () => {
              streamCalls += 1
              const midpoint = Math.floor(slice.byteLength / 2)
              const pieces = [slice.subarray(0, midpoint), slice.subarray(midpoint)]
              let index = 0
              return {
                read: () => Promise.resolve(index < pieces.length ? pieces[index++] : null),
              }
            },
            cancel: () => {},
          },
        })
      },
    }

    const client = new Client(
      {
        endpoint: 'http://oss-cn-hangzhou.aliyuncs.com',
        region: 'cn-hangzhou',
        credentialsProvider: new StaticCredentialsProvider('ak', 'sk'),
      },
      (options) => {
        options.transport = transport
      },
    )
    const fs = new OssFs(client)
    const handle = await fs.openReadOnly('bucket', 'key')

    const stream = await handle.createReadStream({ enablePrefetch: true, prefetchNum: 2, chunkSize: 6 })
    const chunks: Uint8Array[] = []
    for await (const chunk of stream) {
      chunks.push(chunk as Uint8Array)
    }

    expect(new TextDecoder().decode(concatBytes(chunks))).toBe('012345')
    expect(bytesCalls).toBe(0)
    expect(streamCalls).toBe(1)
  })

  it('prefetch reconnects a slot from the last written byte after a read error', async () => {
    const data = objectBytes('hello world')
    const getRequests: RequestMessage[] = []
    let attempts = 0

    const transport = {
      send: (request: RequestMessage) => {
        if (request.method === 'HEAD') {
          return Promise.resolve({
            status: 'OK',
            statusCode: 200,
            headers: headResponse(data.byteLength).headers,
            body: undefined,
          })
        }
        getRequests.push(request)
        attempts += 1
        const range = request.headers.get('range') ?? ''
        const start = parseInt(range.slice(6).split('-')[0], 10)
        const slice = data.subarray(start)
        const fail = attempts === 1
        return Promise.resolve({
          status: 'Partial Content',
          statusCode: 206,
          headers: { 'content-range': `bytes ${start}-${data.byteLength - 1}/${data.byteLength}` },
          body: {
            bytes: () => Promise.reject(new Error('bytes() must not be called')),
            text: () => Promise.reject(new Error('text() must not be called')),
            stream: () => {
              let sent = 0
              return {
                read: () => {
                  if (fail && sent === 1) {
                    sent += 1
                    return Promise.reject(new Error('connection reset'))
                  }
                  if (sent === 0) {
                    sent = 1
                    return Promise.resolve(fail ? slice.subarray(0, 5) : slice)
                  }
                  return Promise.resolve(null)
                },
              }
            },
            cancel: () => {},
          },
        })
      },
    }

    const client = new Client(
      {
        endpoint: 'http://oss-cn-hangzhou.aliyuncs.com',
        region: 'cn-hangzhou',
        credentialsProvider: new StaticCredentialsProvider('ak', 'sk'),
      },
      (options) => {
        options.transport = transport
      },
    )
    const fs = new OssFs(client)
    const handle = await fs.openReadOnly('bucket', 'key')

    const stream = await handle.createReadStream({ enablePrefetch: true, prefetchNum: 2 })
    const chunks: Uint8Array[] = []
    for await (const chunk of stream) {
      chunks.push(chunk as Uint8Array)
    }

    expect(new TextDecoder().decode(concatBytes(chunks))).toBe('hello world')
    expect(getRequests.map((r) => r.headers.get('range'))).toEqual(['bytes=0-10', 'bytes=5-10'])
  })

  it('prefetch gives up on a terminal stream error', async () => {
    const data = objectBytes('abcd')
    const getRequests: RequestMessage[] = []

    const transport = {
      send: (request: RequestMessage) => {
        if (request.method === 'HEAD') {
          return Promise.resolve({
            status: 'OK',
            statusCode: 200,
            headers: headResponse(data.byteLength).headers,
            body: undefined,
          })
        }
        getRequests.push(request)
        return Promise.resolve({
          status: 'Partial Content',
          statusCode: 206,
          headers: { 'content-range': `bytes 0-${data.byteLength - 1}/${data.byteLength}` },
          body: {
            bytes: () => Promise.reject(new Error('bytes() must not be called')),
            text: () => Promise.reject(new Error('text() must not be called')),
            stream: () => {
              let sent = false
              return {
                read: () => {
                  if (sent) {
                    const error = new Error('aborted')
                    error.name = 'AbortError'
                    return Promise.reject(error)
                  }
                  sent = true
                  return Promise.resolve(data.subarray(0, 2))
                },
              }
            },
            cancel: () => {},
          },
        })
      },
    }

    const client = new Client(
      {
        endpoint: 'http://oss-cn-hangzhou.aliyuncs.com',
        region: 'cn-hangzhou',
        credentialsProvider: new StaticCredentialsProvider('ak', 'sk'),
      },
      (options) => {
        options.transport = transport
      },
    )
    const fs = new OssFs(client)
    const handle = await fs.openReadOnly('bucket', 'key')

    const stream = await handle.createReadStream({ enablePrefetch: true, prefetchNum: 2 })
    await expect(async () => {
      for await (const chunk of stream) {
        void chunk
      }
    }).rejects.toThrow('aborted')

    expect(getRequests).toHaveLength(1)
  })

  it('throws when a prefetched response has a changed ETag', async () => {
    const data = objectBytes('0123456789ab')
    const { client } = ossClient([
      headResponse(data.byteLength),
      { body: data, headers: { etag: '"etag"' } },
      { body: data, headers: { etag: '"changed"' } },
      { body: data, headers: { etag: '"etag"' } },
    ])
    const fs = new OssFs(client)
    const handle = await fs.openReadOnly('bucket', 'key')
    const stream = await handle.createReadStream({ enablePrefetch: true, prefetchNum: 3, chunkSize: 4 })

    await expect(async () => {
      const chunks: Uint8Array[] = []
      for await (const chunk of stream) {
        chunks.push(chunk as Uint8Array)
      }
    }).rejects.toThrow('ETag changed')
  })

  it('cancelling a prefetched stream stops further requests', async () => {
    const data = objectBytes('012345')
    const { client, transport } = ossClient([headResponse(data.byteLength), { body: data }])
    const fs = new OssFs(client)
    const handle = await fs.openReadOnly('bucket', 'key')
    const stream = await handle.createReadStream({ enablePrefetch: true, prefetchNum: 3, chunkSize: 2 })

    const iter = stream[Symbol.asyncIterator]()
    const first = await iter.next()
    expect(first.done).toBe(false)
    await iter.return!()

    const ranges = transport.requests.filter((r) => r.method === 'GET').map((r) => r.headers.get('range'))
    expect(ranges).toHaveLength(3)
  })

  it('inherits prefetch settings from OpenOptions', async () => {
    const data = objectBytes('012345')
    const { client, transport } = ossClient([headResponse(data.byteLength), { body: data }])
    const fs = new OssFs(client)
    const handle = await fs.openReadOnly('bucket', 'key', {
      enablePrefetch: true,
      prefetchNum: 3,
      chunkSize: 2,
    })

    const stream = await handle.createReadStream()
    const chunks: Uint8Array[] = []
    for await (const chunk of stream) {
      chunks.push(chunk as Uint8Array)
      if (chunks.length === 1) break
    }

    const ranges = transport.requests.filter((r) => r.method === 'GET').map((r) => r.headers.get('range'))
    expect(ranges).toEqual(['bytes=0-1', 'bytes=2-3', 'bytes=4-5'])
  })

  it('stream prefetch options override OpenOptions', async () => {
    const data = objectBytes('0123')
    const { client, transport } = ossClient([headResponse(data.byteLength), { body: data }])
    const fs = new OssFs(client)
    const handle = await fs.openReadOnly('bucket', 'key', { enablePrefetch: false })

    const stream = await handle.createReadStream({ enablePrefetch: true, prefetchNum: 2, chunkSize: 2 })
    const chunks: Uint8Array[] = []
    for await (const chunk of stream) {
      chunks.push(chunk as Uint8Array)
      if (chunks.length === 1) break
    }

    const ranges = transport.requests.filter((r) => r.method === 'GET').map((r) => r.headers.get('range'))
    expect(ranges).toEqual(['bytes=0-1', 'bytes=2-3'])
  })
})

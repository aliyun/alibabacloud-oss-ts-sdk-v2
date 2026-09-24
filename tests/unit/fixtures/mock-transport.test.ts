import { describe, expect, it } from 'vitest'
import { bytesBody, createMockTransport, textBody } from '../../fixtures/mock-transport.js'
import { utf8Decode } from '../../../src/utils/bytes.js'
import { createHeaderFields } from '../../../src/utils/header-fields.js'

describe('createMockTransport', () => {
  it('serves queued responses in order and records the requests', async () => {
    const transport = createMockTransport({
      responses: [
        { statusCode: 200, status: 'OK', headers: { etag: '"A"' } },
        { statusCode: 204, status: 'No Content', headers: {} },
      ],
    })
    const first = await transport.send({ method: 'PUT', url: 'https://b.example.com/k', headers: createHeaderFields() }, {})
    const second = await transport.send({ method: 'DELETE', url: 'https://b.example.com/k', headers: createHeaderFields() }, {})
    expect(first.statusCode).toBe(200)
    expect(second.statusCode).toBe(204)
    expect(transport.requests.length).toBe(2)
    expect(transport.requests[0].method).toBe('PUT')
    expect(transport.requests[1].method).toBe('DELETE')
  })

  it('replays the last response once the queue is exhausted', async () => {
    const transport = createMockTransport({
      responses: [
        { statusCode: 500, status: 'Internal Server Error', headers: {} },
        { statusCode: 200, status: 'OK', headers: {} },
      ],
    })
    expect((await transport.send({ method: 'GET', url: 'https://x/', headers: createHeaderFields() }, {})).statusCode).toBe(500)
    expect((await transport.send({ method: 'GET', url: 'https://x/', headers: createHeaderFields() }, {})).statusCode).toBe(200)
    expect((await transport.send({ method: 'GET', url: 'https://x/', headers: createHeaderFields() }, {})).statusCode).toBe(200)
  })

  it('serves a fresh headers object on every replay', async () => {
    const transport = createMockTransport({ responses: [{ statusCode: 200, status: 'OK', headers: { etag: '"A"' } }] })
    const first = await transport.send({ method: 'GET', url: 'https://x/', headers: createHeaderFields() }, {})
    first.headers.etag = '"mutated"'
    const second = await transport.send({ method: 'GET', url: 'https://x/', headers: createHeaderFields() }, {})
    expect(second.headers.etag).toBe('"A"')
  })

  it('throws a queued transport error', async () => {
    const transport = createMockTransport({ responses: [{ error: new Error('socket hang up') }] })
    await expect(transport.send({ method: 'GET', url: 'https://x/', headers: createHeaderFields() }, {})).rejects.toThrow('socket hang up')
  })

  it('records the send options of every send, in order', async () => {
    const transport = createMockTransport()
    await transport.send({ method: 'GET', url: 'https://x/', headers: createHeaderFields() }, { readWriteTimeoutMs: 1_000 })
    await transport.send({ method: 'GET', url: 'https://x/', headers: createHeaderFields() }, { readWriteTimeoutMs: 20_000 })
    expect(transport.sendOptions).toEqual([{ readWriteTimeoutMs: 1_000 }, { readWriteTimeoutMs: 20_000 }])
  })

  it('exposes a readable body helper', async () => {
    const body = textBody('<Error><Code>NoSuchKey</Code></Error>')
    expect(await body.text()).toBe('<Error><Code>NoSuchKey</Code></Error>')
    expect((await body.bytes()).length).toBe(37)
  })

  it('round-trips a multi-byte body', async () => {
    const body = textBody('存储/オブジェクト')
    expect(await body.text()).toBe('存储/オブジェクト')
    expect((await body.bytes()).length).toBe(25)
  })

  it('reads a body through stream()', async () => {
    const reader = textBody('<Error><Code>NoSuchKey</Code></Error>').stream()
    const chunk = await reader.read()
    expect(chunk === null ? '' : utf8Decode(chunk)).toBe('<Error><Code>NoSuchKey</Code></Error>')
    expect(await reader.read()).toBeNull()
  })

  it('reports an empty body as the end of the stream, not as an empty chunk', async () => {
    expect(await bytesBody(new Uint8Array(0)).stream().read()).toBeNull()
  })
})

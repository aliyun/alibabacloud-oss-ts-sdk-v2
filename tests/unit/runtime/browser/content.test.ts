import { describe, expect, it } from 'vitest'
import { BlobContent, blobBody, readableStreamBody } from '../../../../src/runtime/browser/content.js'
import { StreamContent } from '../../../../src/transport/content.js'
import type { ByteSource } from '../../../../src/transport/types.js'
import { utf8Decode, utf8Encode } from '../../../../src/utils/bytes.js'

// Pulls a cursor to exhaustion.
async function drain(source: ByteSource): Promise<Uint8Array> {
  const chunks: Uint8Array[] = []
  for (;;) {
    const chunk = await source.read()
    if (chunk === null) break
    chunks.push(chunk)
  }
  const bytes = new Uint8Array(chunks.reduce((sum, c) => sum + c.byteLength, 0))
  let at = 0
  for (const c of chunks) {
    bytes.set(c, at)
    at += c.byteLength
  }
  return bytes
}

describe('BlobContent', () => {
  it('reports the blob size as its length and is replayable, never one-shot', () => {
    const content = new BlobContent(new Blob(['blobbed']))

    expect(content.length).toBe(7)
    expect(content.oneShot).toBe(false)
  })

  it('exposes the blob for a transport that hands it straight to fetch', () => {
    const blob = new Blob(['x'])
    expect(new BlobContent(blob).blob).toBe(blob)
  })

  it('reads the blob bytes through the cursor', async () => {
    const content = new BlobContent(new Blob(['键值']))
    expect(utf8Decode(await drain(content.source()))).toBe('键值')
  })

  it('opens a fresh cursor per source(), so each attempt re-reads the blob', async () => {
    const content = new BlobContent(new Blob(['again']))

    expect(utf8Decode(await drain(content.source()))).toBe('again')
    expect(utf8Decode(await drain(content.source()))).toBe('again')
  })

  it('blobBody wraps a Blob as a BlobContent', () => {
    const body = blobBody(new Blob(['abc']))
    expect(body).toBeInstanceOf(BlobContent)
    expect(body.length).toBe(3)
  })
})

describe('readableStreamBody', () => {
  function streamOf(...chunks: Uint8Array[]): ReadableStream<Uint8Array> {
    let at = 0
    return new ReadableStream<Uint8Array>({
      pull(controller) {
        if (at < chunks.length) controller.enqueue(chunks[at++])
        else controller.close()
      },
    })
  }

  it('wraps a web ReadableStream as a one-shot StreamContent', async () => {
    const body = readableStreamBody(streamOf(utf8Encode('ab'), utf8Encode('cd')))

    expect(body).toBeInstanceOf(StreamContent)
    expect(body.oneShot).toBe(true)
    expect(utf8Decode(await drain(body.source()))).toBe('abcd')
  })

  it('passes a declared length through and leaves it undefined otherwise', () => {
    expect(readableStreamBody(streamOf(), { length: 12 }).length).toBe(12)
    expect(readableStreamBody(streamOf()).length).toBeUndefined()
  })

  it('cancel cancels the underlying reader when the cursor is abandoned', async () => {
    let canceled = 0
    const stream = new ReadableStream<Uint8Array>({
      pull(controller) {
        controller.enqueue(utf8Encode('x'))
      },
      cancel() {
        canceled++
      },
    })

    const cursor = readableStreamBody(stream).source()
    expect(utf8Decode((await cursor.read()) ?? new Uint8Array(0))).toBe('x')
    await cursor.cancel?.()
    await cursor.cancel?.()
    expect(canceled).toBe(1)
  })
})

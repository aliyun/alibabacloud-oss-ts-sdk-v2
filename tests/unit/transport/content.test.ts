import { describe, expect, it } from 'vitest'
import {
  BytesContent,
  StreamContent,
  StringContent,
  bytesBody,
  streamBody,
  stringBody,
  toByteContent,
} from '../../../src/transport/content.js'
import type { ByteContent, ByteSource } from '../../../src/transport/types.js'
import { utf8Decode, utf8Encode } from '../../../src/utils/bytes.js'

// Pulls a cursor to exhaustion so a test can assert both the bytes it yields and that `null` -- not an
// empty chunk -- is the single end signal.
async function drain(source: ByteSource): Promise<{ chunks: Uint8Array[]; bytes: Uint8Array }> {
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
  return { chunks, bytes }
}

describe('BytesContent', () => {
  it('reports its byte length and is replayable, never one-shot', () => {
    const content = new BytesContent(new Uint8Array([1, 2, 3, 4]))

    expect(content.length).toBe(4)
    expect(content.oneShot).toBe(false)
  })

  it('exposes the whole payload for a buffering transport to read without a cursor', () => {
    const bytes = new Uint8Array([9, 8, 7])
    expect(new BytesContent(bytes).bytes).toBe(bytes)
  })

  it('yields the bytes as a single chunk, then null', async () => {
    const source = new BytesContent(new Uint8Array([1, 2, 3])).source()

    expect(await source.read()).toEqual(new Uint8Array([1, 2, 3]))
    expect(await source.read()).toBeNull()
  })

  it('hands out an independent cursor per source(), so every attempt re-reads the same bytes', async () => {
    const content = new BytesContent(new Uint8Array([5, 6]))

    expect((await drain(content.source())).bytes).toEqual(new Uint8Array([5, 6]))
    // A second cursor starts over -- the primitive a retry needs.
    expect((await drain(content.source())).bytes).toEqual(new Uint8Array([5, 6]))
  })

  it('signals end with null and never an empty chunk, even when empty', async () => {
    const { chunks } = await drain(new BytesContent(new Uint8Array(0)).source())

    // A zero-length payload yields no chunk at all: the first read is the end.
    expect(chunks).toEqual([])
    expect(new BytesContent(new Uint8Array(0)).length).toBe(0)
  })
})

describe('StringContent', () => {
  it('measures and emits UTF-8 byte length, not character count', async () => {
    // Two CJK characters, three UTF-8 bytes each.
    const content = new StringContent('键值')

    expect(content.length).toBe(6)
    expect(content.oneShot).toBe(false)
    expect((await drain(content.source())).bytes).toEqual(utf8Encode('键值'))
  })

  it('encodes once at construction and re-reads the same bytes on each cursor', async () => {
    const content = new StringContent('hello')

    expect(content.bytes).toEqual(utf8Encode('hello'))
    expect(utf8Decode((await drain(content.source())).bytes)).toBe('hello')
    expect(utf8Decode((await drain(content.source())).bytes)).toBe('hello')
  })

  it('yields nothing for an empty string', async () => {
    expect(new StringContent('').length).toBe(0)
    expect((await drain(new StringContent('').source())).chunks).toEqual([])
  })
})

describe('StreamContent', () => {
  function once(chunks: Uint8Array[]): ByteSource {
    let at = 0
    return { read: (): Promise<Uint8Array | null> => Promise.resolve(at < chunks.length ? chunks[at++] : null) }
  }

  it('is always one-shot and hands back the single underlying cursor', () => {
    const cursor = once([])
    const content = new StreamContent(cursor)

    expect(content.oneShot).toBe(true)
    // source() does not wrap or copy -- it is the same cursor, so a second call cannot restart it.
    expect(content.source()).toBe(cursor)
  })

  it('cannot be replayed: a second source() continues the exhausted cursor', async () => {
    const content = new StreamContent(once([new Uint8Array([1]), new Uint8Array([2])]))

    expect((await drain(content.source())).bytes).toEqual(new Uint8Array([1, 2]))
    // The cursor is spent; there is nothing left for a retry to read.
    expect((await drain(content.source())).chunks).toEqual([])
  })

  it('carries a declared length when given one', () => {
    expect(new StreamContent(once([]), { length: 42 }).length).toBe(42)
  })

  it('leaves length undefined for chunked transfer when none is declared', () => {
    expect(new StreamContent(once([])).length).toBeUndefined()
  })
})

describe('the body factories', () => {
  it('bytesBody wraps a Uint8Array as a BytesContent', () => {
    const body = bytesBody(new Uint8Array([1]))
    expect(body).toBeInstanceOf(BytesContent)
    expect(body.length).toBe(1)
  })

  it('stringBody wraps a string as a StringContent', () => {
    const body = stringBody('键')
    expect(body).toBeInstanceOf(StringContent)
    expect(body.length).toBe(3)
  })

  it('streamBody wraps a cursor as a one-shot StreamContent, passing length through', () => {
    const source: ByteSource = { read: (): Promise<Uint8Array | null> => Promise.resolve(null) }
    const body = streamBody(source, { length: 7 })

    expect(body).toBeInstanceOf(StreamContent)
    expect(body.oneShot).toBe(true)
    expect(body.length).toBe(7)
    expect(body.source()).toBe(source)
  })
})

describe('toByteContent', () => {
  it('passes undefined through', () => {
    expect(toByteContent(undefined)).toBeUndefined()
  })

  it('normalizes a string to a StringContent', () => {
    const content = toByteContent('键值')
    expect(content).toBeInstanceOf(StringContent)
    expect(content?.length).toBe(6)
  })

  it('normalizes a Uint8Array to a BytesContent', () => {
    const content = toByteContent(new Uint8Array([1, 2, 3]))
    expect(content).toBeInstanceOf(BytesContent)
    expect(content?.length).toBe(3)
  })

  it('passes an existing ByteContent through untouched, keeping its concrete type', () => {
    // A platform FileContent/BlobContent must survive normalization so the transport can dispatch on it.
    const custom: ByteContent = {
      length: 10,
      oneShot: false,
      source: (): ByteSource => ({ read: (): Promise<Uint8Array | null> => Promise.resolve(null) }),
    }
    expect(toByteContent(custom)).toBe(custom)
  })
})

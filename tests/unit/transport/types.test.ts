import { describe, expect, it } from 'vitest'
import { MemorySinkFactory } from '../../../src/transport/types.js'
import { OssError } from '../../../src/error/types.js'
import { ClientErrorRetryable } from '../../../src/retry/retryable.js'
import { utf8Decode, utf8Encode } from '../../../src/utils/bytes.js'

/** A buffer of `byteLength` holding `text` from `offset`, with the rest left at zero. */
function bufferWith(text: string, byteLength = text.length, offset = 0): Uint8Array {
  const buffer = new Uint8Array(byteLength)
  buffer.set(utf8Encode(text), offset)
  return buffer
}

/** Writes a chunk to a sink. */
function take(sink: { write(chunk: Uint8Array): void | Promise<void> }, text: string): void {
  void sink.write(utf8Encode(text))
}

describe('MemorySinkFactory', () => {
  it('fills a caller-owned buffer and reports how much landed', () => {
    const buffer = new Uint8Array(8)
    const factory = new MemorySinkFactory(buffer)

    const sink = factory.supplier(5, {})
    take(sink, 'abc')
    take(sink, 'de')

    expect(utf8Decode(buffer.subarray(0, 5))).toBe('abcde')
    expect(Array.from(buffer.subarray(5))).toEqual([0, 0, 0])
    expect(factory.written).toBe(5)
  })

  it('starts at an offset and leaves the bytes around it alone', () => {
    const buffer = bufferWith('0123456789')
    const factory = new MemorySinkFactory(buffer, { offset: 4 })

    take(factory.supplier(4, {}), 'ABCD')

    expect(utf8Decode(buffer)).toBe('0123ABCD89')
    expect(factory.written).toBe(4)
  })

  // A view names a region of a larger pool, and the write stays inside the region.
  it('writes through a view without touching the pool behind it', () => {
    const pool = bufferWith('---------')
    const factory = new MemorySinkFactory(pool.subarray(2, 5))

    take(factory.supplier(3, {}), 'xyz')

    expect(utf8Decode(pool)).toBe('--xyz----')
  })

  it('restarts at the offset for each attempt', () => {
    const buffer = bufferWith('0123456789')
    const factory = new MemorySinkFactory(buffer, { offset: 2 })
    expect(factory.oneShot).toBe(false)

    take(factory.supplier(4, {}), 'ABCD')
    expect(utf8Decode(buffer)).toBe('01ABCD6789')

    take(factory.supplier(4, {}), 'ABCD')
    expect(utf8Decode(buffer)).toBe('01ABCD6789')
    expect(factory.written).toBe(4)

    // The sink overwrites rather than clears, so a short attempt leaves the tail of the longer one.
    take(factory.supplier(2, {}), 'xy')
    expect(utf8Decode(buffer)).toBe('01xyCD6789')
    expect(factory.written).toBe(2)
  })

  it('reports nothing before an attempt has written', () => {
    expect(new MemorySinkFactory(new Uint8Array(8)).written).toBe(0)
  })

  it('refuses a response whose declared length will not fit, before pulling it', () => {
    const buffer = bufferWith('0123456789')
    const factory = new MemorySinkFactory(buffer, { offset: 8 })

    expect(() => factory.supplier(65536, {})).toThrow('declares 65536 bytes, which does not fit the 2 bytes left')
    expect(factory.written).toBe(0)
    expect(utf8Decode(buffer)).toBe('0123456789')
  })

  // Refused whole, so the buffer never holds a prefix that reads as the complete object.
  it('refuses a chunk that outgrows the room and keeps the bytes already written', () => {
    const buffer = bufferWith('0123456789')
    const factory = new MemorySinkFactory(buffer, { offset: 8 })
    const sink = factory.supplier(-1, {})

    take(sink, 'AB')
    expect(() => sink.write(utf8Encode('CD'))).toThrow('does not fit the 2 bytes left in the buffer')
    expect(() => sink.write(utf8Encode('CDE'))).toThrow('does not fit the 2 bytes left in the buffer')

    expect(utf8Decode(buffer)).toBe('01234567AB')
    expect(factory.written).toBe(2)
  })

  it('names the length the response declared when a body turns out longer', () => {
    const factory = new MemorySinkFactory(new Uint8Array(4))
    const sink = factory.supplier(4, {})

    take(sink, 'abcd')
    expect(() => sink.write(utf8Encode('e'))).toThrow('the 4 bytes left in the buffer for it, of which it declared 4 bytes in all')
  })

  it('ends the attempt with a failure no retry can improve', () => {
    const factory = new MemorySinkFactory(new Uint8Array(4))
    let error: unknown
    try {
      factory.supplier(40, {})
    } catch (caught) {
      error = caught
    }

    expect(error).toBeInstanceOf(OssError)
    expect(new ClientErrorRetryable().isErrorRetryable(error as Error)).toBe(false)
  })
})

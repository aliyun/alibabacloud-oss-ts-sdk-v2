import { Readable } from 'node:stream'
import { describe, expect, it } from 'vitest'
import { fromReadable } from '../../../../src/runtime/node/stream.js'
import { utf8Decode, utf8Encode } from '../../../../src/utils/bytes.js'

function readableOf(...chunks: string[]): Readable {
  return Readable.from(chunks.map((chunk) => utf8Encode(chunk)))
}

describe('fromReadable', () => {
  it('yields the chunks in order', async () => {
    const stream = fromReadable(readableOf('one', 'two', 'three'))
    const seen: string[] = []
    for (;;) {
      const chunk = await stream.read()
      if (chunk === null) break
      seen.push(utf8Decode(chunk))
    }
    expect(seen).toEqual(['one', 'two', 'three'])
  })

  it('returns null at the end, and keeps returning null', async () => {
    const stream = fromReadable(readableOf('only'))
    expect(utf8Decode((await stream.read()) ?? new Uint8Array(0))).toBe('only')
    expect(await stream.read()).toBeNull()
    expect(await stream.read()).toBeNull()
    expect(await stream.read()).toBeNull()
  })

  it('skips zero-length chunks', async () => {
    const stream = fromReadable(
      Readable.from([utf8Encode('a'), new Uint8Array(0), utf8Encode('b'), new Uint8Array(0)]),
    )
    expect(utf8Decode((await stream.read()) ?? new Uint8Array(0))).toBe('a')
    expect(utf8Decode((await stream.read()) ?? new Uint8Array(0))).toBe('b')
    expect(await stream.read()).toBeNull()
  })

  it('reads an empty source as immediately exhausted', async () => {
    expect(await fromReadable(Readable.from([])).read()).toBeNull()
  })

  it('propagates the source error unwrapped, so `code` survives', async () => {
    const boom = new Error('read ECONNRESET') as Error & { code?: string }
    boom.code = 'ECONNRESET'
    function* chunks(): Generator<Uint8Array> {
      yield utf8Encode('partial')
      throw boom
    }

    const stream = fromReadable(Readable.from(chunks()))
    expect(utf8Decode((await stream.read()) ?? new Uint8Array(0))).toBe('partial')
    await expect(stream.read()).rejects.toBe(boom)
  })

  it('pulls lazily -- one read consumes one chunk', async () => {
    let produced = 0
    const source: AsyncIterable<Uint8Array> = {
      [Symbol.asyncIterator]: () => ({
        next: () => {
          produced++
          return Promise.resolve({ done: false, value: utf8Encode('chunk') })
        },
      }),
    }

    const stream = fromReadable(source)
    await stream.read()
    expect(produced).toBe(1)
    await stream.read()
    expect(produced).toBe(2)
  })

  // A caller can hand any async iterable to `PutObject`, so the source is untrusted: unlike a drained `Readable`, it need not stay idempotent once done, but `StreamLike` promises `read()` keeps answering null.
  it('never touches the source again once it has said done', async () => {
    let calls = 0
    const source: AsyncIterable<Uint8Array> = {
      [Symbol.asyncIterator]: () => ({
        next: () => {
          calls++
          if (calls === 1) return Promise.resolve({ done: false, value: utf8Encode('one') })
          if (calls === 2) return Promise.resolve({ done: true, value: undefined })
          return Promise.reject(new Error('read after end'))
        },
      }),
    }

    const stream = fromReadable(source)
    expect(utf8Decode((await stream.read()) ?? new Uint8Array(0))).toBe('one')
    expect(await stream.read()).toBeNull()
    expect(await stream.read()).toBeNull()
    expect(calls).toBe(2)
  })

  it('cancel destroys the underlying node Readable, releasing its resource', async () => {
    const readable = Readable.from([utf8Encode('a'), utf8Encode('b')])
    const stream = fromReadable(readable)
    expect(utf8Decode((await stream.read()) ?? new Uint8Array(0))).toBe('a')

    await stream.cancel?.()
    expect(readable.destroyed).toBe(true)
    // A cancelled cursor keeps answering null, like an exhausted one.
    expect(await stream.read()).toBeNull()
  })

  it('cancel returns the iterator once, and is a no-op after exhaustion or a second call', async () => {
    let returned = 0
    const source: AsyncIterable<Uint8Array> = {
      [Symbol.asyncIterator]: () => ({
        next: () => Promise.resolve({ done: false, value: utf8Encode('x') }),
        return: () => {
          returned++
          return Promise.resolve({ done: true, value: undefined })
        },
      }),
    }

    const stream = fromReadable(source)
    await stream.read()
    await stream.cancel?.()
    await stream.cancel?.()
    expect(returned).toBe(1)
  })

  it('does not return the iterator when the stream has already ended on its own', async () => {
    let returned = 0
    const source: AsyncIterable<Uint8Array> = {
      [Symbol.asyncIterator]: () => ({
        next: () => Promise.resolve({ done: true, value: undefined }),
        return: () => {
          returned++
          return Promise.resolve({ done: true, value: undefined })
        },
      }),
    }

    const stream = fromReadable(source)
    expect(await stream.read()).toBeNull()
    await stream.cancel?.()
    expect(returned).toBe(0)
  })

  it('takes the iterator once, so a re-iterable source is not restarted', async () => {
    const chunks = [utf8Encode('a'), utf8Encode('b')]
    const source: AsyncIterable<Uint8Array> = {
      [Symbol.asyncIterator]: () => {
        let index = 0
        return {
          next: () => {
            if (index >= chunks.length) return Promise.resolve({ done: true, value: undefined })
            return Promise.resolve({ done: false, value: chunks[index++] })
          },
        }
      },
    }

    const stream = fromReadable(source)
    expect(utf8Decode((await stream.read()) ?? new Uint8Array(0))).toBe('a')
    expect(utf8Decode((await stream.read()) ?? new Uint8Array(0))).toBe('b')
    expect(await stream.read()).toBeNull()
  })
})

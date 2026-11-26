import { beforeEach, describe, expect, it } from 'vitest'
import { fileBody } from '../../../../src/runtime/harmony/file-content.js'
import { FileSinkFactory } from '../../../../src/runtime/harmony/file-sink.js'
import { capWrites, fileBytes, fileText, openHandles, resetFiles } from '../../../fixtures/ohos-file-fs.js'
import { concatBytes, utf8Decode, utf8Encode } from '../../../../src/utils/bytes.js'

beforeEach(() => {
  resetFiles()
})

/** The sink one attempt would be given, which is how the transport obtains it. */
function sinkFor(path: string, offset?: number) {
  return new FileSinkFactory(path, { offset }).supplier(-1, {})
}

describe('FileSinkFactory', () => {
  // Replay is what the flag buys: a second attempt opens the path afresh instead of appending.
  it('declares itself replayable and hands out a new sink each time', () => {
    const factory = new FileSinkFactory('attempt.txt')
    expect(factory.oneShot).toBe(false)
    expect(factory.supplier(-1, {})).not.toBe(factory.supplier(-1, {}))
  })

  it('creates the file on the first byte and writes in order', async () => {
    const sink = sinkFor('target.txt')
    expect(fileBytes('target.txt')).toBeUndefined()

    await sink.write(utf8Encode('abc'))
    await sink.write(utf8Encode('de'))
    expect(fileText('target.txt')).toBe('abcde')

    await sink.close?.()
    expect(openHandles()).toBe(0)
  })

  // A download that fails before its body arrives must not touch the path it was aimed at.
  it('leaves no file when nothing was written', async () => {
    const sink = sinkFor('never.txt')
    await sink.close?.()

    expect(fileBytes('never.txt')).toBeUndefined()
    expect(openHandles()).toBe(0)
  })

  it('replaces what was already at the path', async () => {
    const first = sinkFor('again.txt')
    await first.write(utf8Encode('long standing content'))
    await first.close?.()

    const second = sinkFor('again.txt')
    await second.write(utf8Encode('new'))
    await second.close?.()

    expect(fileText('again.txt')).toBe('new')
  })

  // An offset is a different promise: the bytes ahead of it belong to the caller, and so do the ones behind.
  it('writes at an offset and leaves the rest of the file alone', async () => {
    const start = sinkFor('spans.txt')
    await start.write(utf8Encode('0123456789'))
    await start.close?.()

    const sink = sinkFor('spans.txt', 4)
    await sink.write(utf8Encode('AB'))
    await sink.write(utf8Encode('CD'))
    await sink.close?.()

    expect(fileText('spans.txt')).toBe('0123ABCD89')
  })

  // A replayed attempt rewrites from its offset, so the file neither grows nor moves what came before.
  it('rewrites from the offset when a second attempt takes the same range', async () => {
    const start = sinkFor('range.txt')
    await start.write(utf8Encode('0123456789'))
    await start.close?.()

    const first = sinkFor('range.txt', 2)
    await first.write(utf8Encode('AB'))
    await first.close?.()
    const second = sinkFor('range.txt', 2)
    await second.write(utf8Encode('CDEF'))
    await second.close?.()

    expect(fileText('range.txt')).toBe('01CDEF6789')
  })

  // A position past the end is the platform's to fill, and POSIX fills it with zeros.
  it('grows the file with a hole when the offset is past its end', async () => {
    const start = sinkFor('hole.txt')
    await start.write(utf8Encode('0123'))
    await start.close?.()

    const sink = sinkFor('hole.txt', 6)
    await sink.write(utf8Encode('XY'))
    await sink.close?.()

    expect(Array.from(fileBytes('hole.txt') ?? new Uint8Array(0))).toEqual([48, 49, 50, 51, 0, 0, 88, 89])
  })

  // What decides the mode is whether an offset was given, not where it points: `offset: 0` keeps the tail.
  it('truncates only when the caller gave no offset', async () => {
    const start = sinkFor('zero.txt')
    await start.write(utf8Encode('0123456789'))
    await start.close?.()

    const rewritten = sinkFor('zero.txt', 0)
    await rewritten.write(utf8Encode('AB'))
    await rewritten.close?.()
    expect(fileText('zero.txt')).toBe('AB23456789')

    const whole = sinkFor('zero.txt')
    await whole.write(utf8Encode('again'))
    await whole.close?.()
    expect(fileText('zero.txt')).toBe('again')
  })

  // `@ohos.file.fs` writes a whole `ArrayBuffer`, and a chunk can be a view onto a larger one.
  it('writes the bytes of a view, not the buffer behind it', async () => {
    const pool = new Uint8Array([9, 1, 2, 3, 9])
    const sink = sinkFor('view.bin')
    await sink.write(pool.subarray(1, 4))
    await sink.close?.()

    expect(Array.from(fileBytes('view.bin') ?? new Uint8Array(0))).toEqual([1, 2, 3])
  })

  it('closes as idempotently as the platform would not', async () => {
    const sink = sinkFor('twice.txt')
    await sink.write(utf8Encode('x'))
    await sink.close?.()
    await sink.close?.()

    expect(openHandles()).toBe(0)
  })

  it('refuses a short write, and gives the handle back rather than leak it', async () => {
    capWrites(1)
    const sink = sinkFor('partial.txt')

    await expect(Promise.resolve(sink.write(utf8Encode('abcd')))).rejects.toThrow('wrote 1 of 4 bytes to partial.txt')
    expect(openHandles()).toBe(0)
  })

  // The two halves of the file API meet: what the sink wrote is what a body reads back.
  it('round-trips through fileBody', async () => {
    const sink = sinkFor('round.txt')
    await sink.write(utf8Encode('first '))
    await sink.write(utf8Encode('second'))
    await sink.close?.()

    const body = await fileBody('round.txt')
    expect(body.length).toBe(12)
    const source = body.source()
    const chunks: Uint8Array[] = []
    for (;;) {
      const chunk = await source.read()
      if (chunk === null) break
      chunks.push(chunk)
    }
    expect(utf8Decode(concatBytes(chunks))).toBe('first second')
    expect(openHandles()).toBe(0)
  })
})

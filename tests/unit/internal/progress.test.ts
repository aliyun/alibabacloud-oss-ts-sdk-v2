import { describe, expect, it } from 'vitest'
import { ProgressObserver, resolveUploadTotal } from '../../../src/internal/progress.js'
import { bytesBody, stringBody, streamBody } from '../../../src/transport/content.js'
import { utf8Encode } from '../../../src/utils/bytes.js'
import { createHeaderFields } from '../../../src/utils/header-fields.js'

interface Report {
  increment: number
  transferred: number
  total: number
}

function record(): { reports: Report[]; handler: (i: number, t: number, tot: number) => void } {
  const reports: Report[] = []
  return {
    reports,
    handler: (increment, transferred, total) => reports.push({ increment, transferred, total }),
  }
}

describe('ProgressObserver', () => {
  it('reports the running transferred and the total on each fed chunk', () => {
    const { reports, handler } = record()
    const observer = new ProgressObserver(handler, 10)
    observer.feed(4)
    observer.feed(6)
    expect(reports).toEqual([
      { increment: 4, transferred: 4, total: 10 },
      { increment: 6, transferred: 10, total: 10 },
    ])
  })

  it('stays silent while a re-attempt replays bytes below the last high-water mark', () => {
    const { reports, handler } = record()
    const observer = new ProgressObserver(handler, 10)
    observer.feed(4)
    observer.feed(3) // attempt 1 reached 7, then failed
    observer.reset()
    observer.feed(4) // replayed, below 7 -> silent
    observer.feed(3) // still at 7 -> silent
    observer.feed(3) // now past 7 -> fires
    expect(reports).toEqual([
      { increment: 4, transferred: 4, total: 10 },
      { increment: 3, transferred: 7, total: 10 },
      { increment: 3, transferred: 10, total: 10 },
    ])
  })

  it('reports increment verbatim even on the chunk that crosses the mark', () => {
    const { reports, handler } = record()
    const observer = new ProgressObserver(handler, -1)
    observer.feed(5)
    observer.reset()
    observer.feed(8) // crosses the mark of 5; increment is the whole 8, not 3
    expect(reports[1]).toEqual({ increment: 8, transferred: 8, total: -1 })
  })
})

describe('resolveUploadTotal', () => {
  it('prefers the declared Content-Length, case-insensitively', () => {
    expect(resolveUploadTotal(bytesBody(utf8Encode('hi')), createHeaderFields({ 'Content-Length': '42' }))).toBe(42)
  })

  it('falls back to a byte body length when no header is declared', () => {
    expect(resolveUploadTotal(bytesBody(utf8Encode('hello')), createHeaderFields())).toBe(5)
  })

  it('uses a string body length, which is measured once at construction', () => {
    // 'a string body' is ASCII, so its UTF-8 byte length equals its character count.
    expect(resolveUploadTotal(stringBody('a string body'), createHeaderFields())).toBe(13)
  })

  it('is -1 for a one-shot stream body with no declared length', () => {
    expect(resolveUploadTotal(streamBody({ read: () => Promise.resolve(null) }), createHeaderFields())).toBe(-1)
  })

  it('uses a declared stream length when one is given', () => {
    expect(resolveUploadTotal(streamBody({ read: () => Promise.resolve(null) }, { length: 9 }), createHeaderFields())).toBe(9)
  })

  it('ignores a non-numeric Content-Length', () => {
    expect(resolveUploadTotal(bytesBody(utf8Encode('x')), createHeaderFields({ 'content-length': 'chunked' }))).toBe(1)
  })
})

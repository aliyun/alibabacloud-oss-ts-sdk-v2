import { describe, expect, it } from 'vitest'
import { concatBytes, utf8Decode, utf8Encode } from '../../../src/utils/bytes.js'

describe('utf8Encode', () => {
  it('encodes ASCII one byte per char', () => {
    expect(Array.from(utf8Encode('abc'))).toEqual([0x61, 0x62, 0x63])
  })

  it('encodes two-byte sequences', () => {
    expect(Array.from(utf8Encode('é'))).toEqual([0xc3, 0xa9])
  })

  it('encodes three-byte sequences', () => {
    expect(Array.from(utf8Encode('中'))).toEqual([0xe4, 0xb8, 0xad])
  })

  it('encodes surrogate pairs as four bytes', () => {
    expect(Array.from(utf8Encode('😀'))).toEqual([0xf0, 0x9f, 0x98, 0x80])
  })

  it('replaces a lone surrogate with U+FFFD', () => {
    expect(Array.from(utf8Encode('\ud83d'))).toEqual([0xef, 0xbf, 0xbd])
  })

  it('replaces a high surrogate followed by a non-surrogate and keeps that character', () => {
    expect(Array.from(utf8Encode('\ud83dA'))).toEqual([0xef, 0xbf, 0xbd, 0x41])
    expect(Array.from(utf8Encode('\ud83d中'))).toEqual([0xef, 0xbf, 0xbd, 0xe4, 0xb8, 0xad])
  })

  it('replaces a lone low surrogate with U+FFFD', () => {
    expect(Array.from(utf8Encode('\udc00'))).toEqual([0xef, 0xbf, 0xbd])
    expect(Array.from(utf8Encode('a\udfffb'))).toEqual([0x61, 0xef, 0xbf, 0xbd, 0x62])
  })

  it('returns a right-sized copy, not a view onto the 3x scratch allocation', () => {
    // `subarray` would pass every other test while exposing the whole 3x scratch buffer via `.buffer`.
    expect(utf8Encode('a'.repeat(10)).buffer.byteLength).toBe(10)
    expect(utf8Encode('é'.repeat(10)).buffer.byteLength).toBe(20)
    expect(utf8Encode('😀'.repeat(10)).buffer.byteLength).toBe(40)
  })

  it('encodes the empty string as zero bytes', () => {
    expect(utf8Encode('').length).toBe(0)
  })
})

describe('utf8Decode', () => {
  it('round-trips every encodable shape', () => {
    for (const s of ['', 'abc', 'é', '中文', '😀', 'aé中😀z']) {
      expect(utf8Decode(utf8Encode(s))).toBe(s)
    }
  })
})

function dec(...bytes: number[]): string {
  return utf8Decode(new Uint8Array(bytes))
}

function cps(s: string): number[] {
  return Array.from(s).map((c) => c.codePointAt(0) ?? -1)
}

const FFFD = '\uFFFD'

describe('utf8Decode strictness', () => {
  it('does not swallow an ASCII byte that interrupts a two-byte sequence', () => {
    expect(dec(0xc3, 0x41)).toBe(FFFD + 'A')
    expect(cps(dec(0xc3, 0x41))).toEqual([0xfffd, 0x41])
  })

  it('does not swallow ASCII bytes that interrupt a three-byte sequence', () => {
    expect(dec(0xe4, 0x41, 0x42)).toBe(FFFD + 'AB')
    expect(cps(dec(0xe4, 0x41, 0x42))).toEqual([0xfffd, 0x41, 0x42])
  })

  it('rejects the overlong NUL rather than smuggling U+0000 through', () => {
    expect(dec(0xc0, 0x80)).toBe(FFFD + FFFD)
    expect(cps(dec(0xc0, 0x80))).toEqual([0xfffd, 0xfffd])
  })

  it('rejects an overlong solidus, which must never decode to a path separator', () => {
    expect(dec(0xe0, 0x80, 0xaf)).toBe(FFFD + FFFD + FFFD)
    expect(dec(0xe0, 0x80, 0xaf)).not.toContain('/')
  })

  it('rejects the always-overlong two-byte leads', () => {
    expect(dec(0xc1, 0xbf)).toBe(FFFD + FFFD)
  })

  it('replaces a stray continuation byte and keeps the ASCII around it', () => {
    expect(dec(0x61, 0x80, 0x62)).toBe('a' + FFFD + 'b')
    expect(cps(dec(0x61, 0x80, 0x62))).toEqual([0x61, 0xfffd, 0x62])
  })

  it('yields U+FFFD for a sequence truncated at end of input', () => {
    expect(dec(0xc3)).toBe(FFFD)
    expect(dec(0xe4)).toBe(FFFD)
    expect(dec(0xe4, 0xb8)).toBe(FFFD)
    expect(dec(0xf0)).toBe(FFFD)
    expect(dec(0xf0, 0x9f)).toBe(FFFD)
    expect(dec(0xf0, 0x9f, 0x98)).toBe(FFFD)
  })

  it('rejects an encoded surrogate', () => {
    expect(dec(0xed, 0xa0, 0x80)).toBe(FFFD + FFFD + FFFD)
    expect(cps(dec(0xed, 0xa0, 0x80))).toEqual([0xfffd, 0xfffd, 0xfffd])
  })

  it('rejects a lead byte that could only exceed U+10FFFF', () => {
    expect(dec(0xf5, 0x80, 0x80, 0x80)).toBe(FFFD + FFFD + FFFD + FFFD)
  })

  it('rejects a four-byte sequence decoding above U+10FFFF', () => {
    expect(dec(0xf4, 0x90, 0x80, 0x80)).toBe(FFFD + FFFD + FFFD + FFFD)
  })

  it('resynchronises so a valid sequence after an invalid one still decodes', () => {
    expect(dec(0xe4, 0x41, 0xe4, 0xb8, 0xad)).toBe(FFFD + 'A中')
    expect(dec(0x80, 0xe4, 0xb8, 0xad)).toBe(FFFD + '中')
    expect(dec(0xc0, 0x80, 0xf0, 0x9f, 0x98, 0x80)).toBe(FFFD + FFFD + '😀')
    expect(cps(dec(0xe4, 0x41, 0xe4, 0xb8, 0xad))).toEqual([0xfffd, 0x41, 0x4e2d])
  })

  it('never throws, whatever the bytes', () => {
    for (let b = 0; b <= 0xff; b++) {
      expect(() => dec(b)).not.toThrow()
      expect(() => dec(b, 0x80)).not.toThrow()
      expect(() => dec(b, 0x41)).not.toThrow()
    }
  })
})

describe('utf8 large round-trip', () => {
  it('round-trips large single-unit and astral runs', () => {
    for (const s of ['a'.repeat(200000), '中'.repeat(200000), '\u{1f600}'.repeat(200000)]) {
      expect(utf8Decode(utf8Encode(s))).toBe(s)
    }
  })
})

describe('concatBytes', () => {
  it('joins in order', () => {
    const out = concatBytes([new Uint8Array([1, 2]), new Uint8Array([]), new Uint8Array([3])])
    expect(Array.from(out)).toEqual([1, 2, 3])
  })

  it('returns an empty array for no parts', () => {
    expect(concatBytes([]).length).toBe(0)
  })
})

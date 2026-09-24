import { describe, expect, it } from 'vitest'
import { fromBase64, toBase64 } from '../../../src/utils/base64.js'
import { utf8Encode } from '../../../src/utils/bytes.js'

describe('toBase64', () => {
  it('matches the RFC 4648 test vectors', () => {
    const cases: [string, string][] = [
      ['', ''],
      ['f', 'Zg=='],
      ['fo', 'Zm8='],
      ['foo', 'Zm9v'],
      ['foob', 'Zm9vYg=='],
      ['fooba', 'Zm9vYmE='],
      ['foobar', 'Zm9vYmFy'],
    ]
    for (const [input, expected] of cases) {
      expect(toBase64(utf8Encode(input))).toBe(expected)
    }
  })

  it('encodes high bytes, exercising + and /', () => {
    expect(toBase64(new Uint8Array([0xfb, 0xef, 0xbe]))).toBe('++++')
    expect(toBase64(new Uint8Array([0xff, 0xff, 0xff]))).toBe('////')
  })

  it('produces the Content-MD5 shape used by the V1 signer vectors', () => {
    const md5 = new Uint8Array([
      0x78, 0x1e, 0x5e, 0x24, 0x5d, 0x69, 0xb5, 0x66,
      0x97, 0x9b, 0x86, 0xe2, 0x8d, 0x23, 0xf2, 0xc7,
    ])
    expect(toBase64(md5)).toBe('eB5eJF1ptWaXm4bijSPyxw==')
  })
})

describe('fromBase64', () => {
  it('round-trips', () => {
    for (const s of ['', 'f', 'fo', 'foo', 'foob', 'fooba', 'foobar']) {
      expect(utf8Encode(s)).toEqual(fromBase64(toBase64(utf8Encode(s))))
    }
  })

  it('ignores whitespace', () => {
    expect(Array.from(fromBase64('Zm9v\nYmFy'))).toEqual(Array.from(utf8Encode('foobar')))
  })

  it('throws on an invalid character', () => {
    expect(() => fromBase64('Zm9v*')).toThrow(/invalid base64/i)
  })

  it('throws on a 4k+1 length instead of fabricating a byte out of 6 bits', () => {
    expect(() => fromBase64('Zm9vY')).toThrow(/invalid base64/i)
    expect(() => fromBase64('A')).toThrow(/invalid base64/i)
  })

  it('accepts `=` anywhere, which is a deliberate decision and not an oversight', () => {
    expect(Array.from(fromBase64('Z=g='))).toEqual(Array.from(fromBase64('Zg==')))
    expect(Array.from(fromBase64('Z=g='))).toEqual([0x66])
    expect(Array.from(fromBase64('=Zm9v='))).toEqual(Array.from(utf8Encode('foo')))
  })

  it('names the offending character by code point rather than echoing it', () => {
    // Server-controlled text: a BEL or ANSI escape must not reach a log.
    const bel = '\u0007'
    let message = ''
    try {
      fromBase64('Zm9v' + bel)
    } catch (e) {
      message = (e as Error).message
    }
    expect(message).toContain('U+0007')
    expect(message).toContain('index 4')
    expect(message).not.toContain(bel)
  })

  it('reports a UTF-16 offset, naming the lead surrogate of an astral character', () => {
    let message = ''
    try {
      fromBase64('Zm9v\u{1f600}')
    } catch (e) {
      message = (e as Error).message
    }
    expect(message).toContain('U+D83D')
    expect(message).toContain('index 4')
  })
})

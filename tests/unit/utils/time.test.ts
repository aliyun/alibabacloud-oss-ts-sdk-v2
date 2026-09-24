import { describe, expect, it } from 'vitest'
import { httpTime, iso8601Date, iso8601Datetime, parseHttpTime } from '../../../src/utils/time.js'

const fixed = new Date(Date.UTC(2022, 11, 28, 10, 27, 41))

describe('httpTime', () => {
  it('formats as RFC 1123 GMT, matching the signer test vectors', () => {
    expect(httpTime(fixed)).toBe('Wed, 28 Dec 2022 10:27:41 GMT')
  })

  it('zero-pads the day', () => {
    expect(httpTime(new Date(Date.UTC(2023, 0, 5, 1, 2, 3)))).toBe('Thu, 05 Jan 2023 01:02:03 GMT')
  })

  it('names every month', () => {
    expect(httpTime(new Date(Date.UTC(2024, 0, 1)))).toBe('Mon, 01 Jan 2024 00:00:00 GMT')
    expect(httpTime(new Date(Date.UTC(2024, 1, 1)))).toBe('Thu, 01 Feb 2024 00:00:00 GMT')
    expect(httpTime(new Date(Date.UTC(2024, 2, 1)))).toBe('Fri, 01 Mar 2024 00:00:00 GMT')
    expect(httpTime(new Date(Date.UTC(2024, 3, 1)))).toBe('Mon, 01 Apr 2024 00:00:00 GMT')
    expect(httpTime(new Date(Date.UTC(2024, 4, 1)))).toBe('Wed, 01 May 2024 00:00:00 GMT')
    expect(httpTime(new Date(Date.UTC(2024, 5, 1)))).toBe('Sat, 01 Jun 2024 00:00:00 GMT')
    expect(httpTime(new Date(Date.UTC(2024, 6, 1)))).toBe('Mon, 01 Jul 2024 00:00:00 GMT')
    expect(httpTime(new Date(Date.UTC(2024, 7, 1)))).toBe('Thu, 01 Aug 2024 00:00:00 GMT')
    expect(httpTime(new Date(Date.UTC(2024, 8, 1)))).toBe('Sun, 01 Sep 2024 00:00:00 GMT')
    expect(httpTime(new Date(Date.UTC(2024, 9, 1)))).toBe('Tue, 01 Oct 2024 00:00:00 GMT')
    expect(httpTime(new Date(Date.UTC(2024, 10, 1)))).toBe('Fri, 01 Nov 2024 00:00:00 GMT')
    expect(httpTime(new Date(Date.UTC(2024, 11, 1)))).toBe('Sun, 01 Dec 2024 00:00:00 GMT')
  })

  it('names every weekday', () => {
    expect(httpTime(new Date(Date.UTC(2024, 8, 1)))).toBe('Sun, 01 Sep 2024 00:00:00 GMT')
    expect(httpTime(new Date(Date.UTC(2024, 8, 2)))).toBe('Mon, 02 Sep 2024 00:00:00 GMT')
    expect(httpTime(new Date(Date.UTC(2024, 8, 3)))).toBe('Tue, 03 Sep 2024 00:00:00 GMT')
    expect(httpTime(new Date(Date.UTC(2024, 8, 4)))).toBe('Wed, 04 Sep 2024 00:00:00 GMT')
    expect(httpTime(new Date(Date.UTC(2024, 8, 5)))).toBe('Thu, 05 Sep 2024 00:00:00 GMT')
    expect(httpTime(new Date(Date.UTC(2024, 8, 6)))).toBe('Fri, 06 Sep 2024 00:00:00 GMT')
    expect(httpTime(new Date(Date.UTC(2024, 8, 7)))).toBe('Sat, 07 Sep 2024 00:00:00 GMT')
  })
})

describe('parseHttpTime', () => {
  it('round-trips httpTime', () => {
    expect(parseHttpTime(httpTime(fixed))?.getTime()).toBe(fixed.getTime())
  })

  it('returns undefined for unparseable input', () => {
    expect(parseHttpTime('not a date')).toBeUndefined()
  })

  it('parses the fixdate form to an exact epoch millisecond', () => {
    expect(parseHttpTime('Wed, 28 Dec 2022 10:27:41 GMT')?.getTime()).toBe(Date.UTC(2022, 11, 28, 10, 27, 41))
  })

  it('parses a zero-padded single-digit day', () => {
    expect(parseHttpTime('Thu, 05 Jan 2023 01:02:03 GMT')?.getTime()).toBe(Date.UTC(2023, 0, 5, 1, 2, 3))
  })

  it('rejects an unknown month abbreviation', () => {
    expect(parseHttpTime('Wed, 28 Foo 2022 10:27:41 GMT')).toBeUndefined()
  })

  it('rejects out-of-range fields', () => {
    expect(parseHttpTime('Wed, 32 Dec 2022 10:27:41 GMT')).toBeUndefined()
    expect(parseHttpTime('Wed, 00 Dec 2022 10:27:41 GMT')).toBeUndefined()
    expect(parseHttpTime('Wed, 28 Dec 2022 24:27:41 GMT')).toBeUndefined()
    expect(parseHttpTime('Wed, 28 Dec 2022 10:60:41 GMT')).toBeUndefined()
    expect(parseHttpTime('Wed, 28 Dec 2022 10:27:60 GMT')).toBeUndefined()
  })

  it('rejects a day that does not exist in the month, rather than rolling it over', () => {
    expect(parseHttpTime('Tue, 31 Feb 2023 00:00:00 GMT')).toBeUndefined()
    expect(parseHttpTime('Sun, 29 Feb 2023 12:00:00 GMT')).toBeUndefined()
  })

  it('accepts a leap day', () => {
    expect(parseHttpTime('Thu, 29 Feb 2024 12:00:00 GMT')?.getTime()).toBe(Date.UTC(2024, 1, 29, 12, 0, 0))
  })

  it('rejects non-numeric digits in the shape', () => {
    expect(parseHttpTime('Wed, 2X Dec 2022 10:27:41 GMT')).toBeUndefined()
    expect(parseHttpTime('Wed, 28 Dec 2O22 10:27:41 GMT')).toBeUndefined()
    expect(parseHttpTime('Wed, 28 Dec 2022 1 :27:41 GMT')).toBeUndefined()
  })

  // A `+08` at fixdate length has valid-looking fields; if the shape gate accepted it the offset
  // would be read as GMT and land eight hours out. Honoured here only via the Date.parse fallback.
  it('does not treat a non-GMT zone at fixdate length as the fixdate shape', () => {
    expect(parseHttpTime('Wed, 28 Dec 2022 10:27:41 +08')?.getTime()).toBe(Date.UTC(2022, 11, 28, 2, 27, 41))
  })

  it('rejects wrong punctuation at a fixdate offset', () => {
    expect(parseHttpTime('Wed, 28 Dec 2022 10.27:41 GMT')).toBeUndefined()
    expect(parseHttpTime('Wed7 28 Dec 2022 10:27:41 GMT')).toBeUndefined()
  })

  it('still accepts an ISO 8601 string through the Date.parse fallback', () => {
    expect(parseHttpTime('2022-12-28T10:27:41Z')?.getTime()).toBe(Date.UTC(2022, 11, 28, 10, 27, 41))
  })
})

describe('iso8601', () => {
  it('formats the V4 datetime and scope date', () => {
    const t = new Date(1702743657 * 1000)
    expect(iso8601Datetime(t)).toBe('20231216T162057Z')
    expect(iso8601Date(t)).toBe('20231216')
  })

  it('zero-pads single-digit month, day, hour, minute and second', () => {
    const t = new Date(Date.UTC(2023, 0, 2, 3, 4, 5))
    expect(iso8601Datetime(t)).toBe('20230102T030405Z')
    expect(iso8601Date(t)).toBe('20230102')
  })
})

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

function pad2(n: number): string {
  return n < 10 ? '0' + String(n) : String(n)
}

/** RFC 1123 in GMT, e.g. `Wed, 28 Dec 2022 10:27:41 GMT`. The `Date` header format. */
export function httpTime(value: Date): string {
  return (
    DAYS[value.getUTCDay()] + ', ' + pad2(value.getUTCDate()) + ' ' + MONTHS[value.getUTCMonth()] + ' ' +
    String(value.getUTCFullYear()) + ' ' + pad2(value.getUTCHours()) + ':' + pad2(value.getUTCMinutes()) + ':' +
    pad2(value.getUTCSeconds()) + ' GMT'
  )
}

/** Length of `Www, DD Mon YYYY HH:MM:SS GMT`, the only shape parseFixdate accepts. */
const FIXDATE_LENGTH = 29

/** Reads exactly `count` ASCII digits at `at`, or -1 if any is not a digit. */
function digitsAt(value: string, at: number, count: number): number {
  let n = 0
  for (let i = at; i < at + count; i++) {
    const c = value.charCodeAt(i)
    if (!(c >= 0x30 && c <= 0x39)) return -1
    n = n * 10 + (c - 0x30)
  }
  return n
}

/** Whether the punctuation and length are the fixdate ones, ignoring the field values. */
function matchesFixdateShape(value: string): boolean {
  return (
    value.length === FIXDATE_LENGTH &&
    value.charCodeAt(3) === 0x2c && value.charCodeAt(4) === 0x20 && value.charCodeAt(7) === 0x20 &&
    value.charCodeAt(11) === 0x20 && value.charCodeAt(16) === 0x20 && value.charCodeAt(19) === 0x3a &&
    value.charCodeAt(22) === 0x3a && value.charCodeAt(25) === 0x20 && value.slice(26) === 'GMT'
  )
}

/** Reads the fields of a string already known to match the fixdate shape. */
function parseFixdate(value: string): Date | undefined {
  const month = MONTHS.indexOf(value.slice(8, 11))
  const day = digitsAt(value, 5, 2)
  const year = digitsAt(value, 12, 4)
  const hour = digitsAt(value, 17, 2)
  const minute = digitsAt(value, 20, 2)
  const second = digitsAt(value, 23, 2)
  if (month < 0 || day < 0 || year < 0 || hour < 0 || minute < 0 || second < 0) return undefined
  const parsed = new Date(Date.UTC(year, month, day, hour, minute, second))
  return (
    parsed.getUTCFullYear() === year && parsed.getUTCMonth() === month && parsed.getUTCDate() === day &&
    parsed.getUTCHours() === hour && parsed.getUTCMinutes() === minute && parsed.getUTCSeconds() === second
  )
    ? parsed
    : undefined
}

/** Parses the `Date` and `Last-Modified` headers without throwing. */
export function parseHttpTime(value: string): Date | undefined {
  if (matchesFixdateShape(value)) return parseFixdate(value)
  const ms = Date.parse(value)
  if (Number.isNaN(ms)) return undefined
  return new Date(ms)
}

/** V4 `x-oss-date`, e.g. `20231216T162057Z`. */
export function iso8601Datetime(value: Date): string {
  return iso8601Date(value) + 'T' + pad2(value.getUTCHours()) + pad2(value.getUTCMinutes()) + pad2(value.getUTCSeconds()) + 'Z'
}

/** V4 credential scope date, e.g. `20231216`. */
export function iso8601Date(value: Date): string {
  return String(value.getUTCFullYear()) + pad2(value.getUTCMonth() + 1) + pad2(value.getUTCDate())
}

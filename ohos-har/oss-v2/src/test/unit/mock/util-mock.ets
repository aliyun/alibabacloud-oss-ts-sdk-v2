function encodeUtf8(value: string): Uint8Array {
  const bytes: number[] = []
  for (let index = 0; index < value.length; index += 1) {
    let codePoint = value.charCodeAt(index)
    if (codePoint >= 0xd800 && codePoint <= 0xdbff && index + 1 < value.length) {
      const next = value.charCodeAt(index + 1)
      if (next >= 0xdc00 && next <= 0xdfff) {
        codePoint = 0x10000 + ((codePoint - 0xd800) << 10) + next - 0xdc00
        index += 1
      } else {
        codePoint = 0xfffd
      }
    } else if (codePoint >= 0xdc00 && codePoint <= 0xdfff) {
      codePoint = 0xfffd
    }

    if (codePoint <= 0x7f) {
      bytes.push(codePoint)
    } else if (codePoint <= 0x7ff) {
      bytes.push(0xc0 | (codePoint >> 6), 0x80 | (codePoint & 0x3f))
    } else if (codePoint <= 0xffff) {
      bytes.push(0xe0 | (codePoint >> 12), 0x80 | ((codePoint >> 6) & 0x3f), 0x80 | (codePoint & 0x3f))
    } else {
      bytes.push(
        0xf0 | (codePoint >> 18),
        0x80 | ((codePoint >> 12) & 0x3f),
        0x80 | ((codePoint >> 6) & 0x3f),
        0x80 | (codePoint & 0x3f)
      )
    }
  }
  return new Uint8Array(bytes)
}

function decodeUtf8(value: Uint8Array): string {
  let result = ''
  for (let index = 0; index < value.length;) {
    const first = value[index]
    if (first < 0x80) {
      result += String.fromCharCode(first)
      index += 1
      continue
    }

    let length = 0
    let codePoint = 0
    if (first >= 0xc2 && first <= 0xdf) {
      length = 2
      codePoint = first & 0x1f
    } else if (first >= 0xe0 && first <= 0xef) {
      length = 3
      codePoint = first & 0x0f
    } else if (first >= 0xf0 && first <= 0xf4) {
      length = 4
      codePoint = first & 0x07
    } else {
      result += '\ufffd'
      index += 1
      continue
    }

    if (index + length > value.length) {
      result += '\ufffd'
      index += 1
      continue
    }

    let valid = true
    for (let offset = 1; offset < length; offset += 1) {
      const next = value[index + offset]
      if ((next & 0xc0) !== 0x80) {
        valid = false
        break
      }
      codePoint = (codePoint << 6) | (next & 0x3f)
    }
    if (!valid || (length === 3 && codePoint < 0x800) || (length === 4 && (codePoint < 0x10000 || codePoint > 0x10ffff))) {
      result += '\ufffd'
      index += 1
      continue
    }

    if (codePoint <= 0xffff) {
      result += String.fromCharCode(codePoint)
    } else {
      const surrogate = codePoint - 0x10000
      result += String.fromCharCode(0xd800 + (surrogate >> 10), 0xdc00 + (surrogate & 0x3ff))
    }
    index += length
  }
  return result
}

class MockTextEncoder {
  encodeInto(value: string): Uint8Array {
    return encodeUtf8(value)
  }
}

class MockTextDecoder {
  decodeToString(value: Uint8Array): string {
    return decodeUtf8(value)
  }
}

class MockTextEncoderFactory {
  create(_encoding: string): MockTextEncoder {
    return new MockTextEncoder()
  }
}

class MockTextDecoderFactory {
  create(_encoding: string): MockTextDecoder {
    return new MockTextDecoder()
  }
}

class MockUtil {
  readonly TextEncoder: MockTextEncoderFactory = new MockTextEncoderFactory()
  readonly TextDecoder: MockTextDecoderFactory = new MockTextDecoderFactory()
}

export default new MockUtil()

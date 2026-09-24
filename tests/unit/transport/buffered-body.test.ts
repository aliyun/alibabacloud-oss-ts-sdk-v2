import { describe, expect, it } from 'vitest'
import { utf8Decode, utf8Encode } from '../../../src/utils/bytes.js'
import { allowsStreaming, bufferedBody } from '../../../src/transport/buffered-body.js'

describe('bufferedBody', () => {
  it('returns the bytes it was given', async () => {
    const bytes = utf8Encode('payload')
    expect(await bufferedBody(bytes).bytes()).toBe(bytes)
  })

  it('decodes text as UTF-8', async () => {
    expect(await bufferedBody(utf8Encode('键值 ✓')).text()).toBe('键值 ✓')
  })

  it('replays the whole buffer through stream(), then reports the end', async () => {
    const stream = bufferedBody(utf8Encode('replayed')).stream()
    expect(utf8Decode((await stream.read()) ?? new Uint8Array(0))).toBe('replayed')
    expect(await stream.read()).toBeNull()
    expect(await stream.read()).toBeNull()
  })

  it('gives every stream() call its own independent replay', async () => {
    const body = bufferedBody(utf8Encode('twice'))
    const first = body.stream()
    const second = body.stream()
    expect(utf8Decode((await first.read()) ?? new Uint8Array(0))).toBe('twice')
    expect(utf8Decode((await second.read()) ?? new Uint8Array(0))).toBe('twice')
  })

  it('treats an empty buffer as an immediately exhausted stream', async () => {
    const body = bufferedBody(new Uint8Array(0))
    expect(await body.stream().read()).toBeNull()
    expect((await body.bytes()).byteLength).toBe(0)
    expect(await body.text()).toBe('')
  })
})

describe('allowsStreaming', () => {
  it('streams only when asked and the status is 2xx without 203', () => {
    expect(allowsStreaming(true, 200)).toBe(true)
    expect(allowsStreaming(true, 204)).toBe(true)
    expect(allowsStreaming(true, 299)).toBe(true)
    expect(allowsStreaming(true, 203)).toBe(false)
    expect(allowsStreaming(true, 199)).toBe(false)
    expect(allowsStreaming(true, 300)).toBe(false)
    expect(allowsStreaming(true, 404)).toBe(false)
    expect(allowsStreaming(true, 500)).toBe(false)
  })

  it('buffers when the caller did not ask to stream, whatever the status', () => {
    expect(allowsStreaming(false, 200)).toBe(false)
    expect(allowsStreaming(undefined, 200)).toBe(false)
    expect(allowsStreaming(undefined, 203)).toBe(false)
  })
})

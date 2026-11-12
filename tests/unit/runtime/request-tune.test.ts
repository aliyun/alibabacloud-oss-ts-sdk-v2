import { describe, expect, it } from 'vitest'
import { tuneRequestForSigning } from '../../../src/runtime/request-tune.harmony.js'
import { createHeaderFields } from '../../../src/utils/header-fields.js'
import type { RequestMessage } from '../../../src/transport/types.js'

function request(method: string, headers?: Record<string, string>): RequestMessage {
  return {
    method,
    url: 'https://bucket.oss-cn-beijing.aliyuncs.com/',
    headers: createHeaderFields(headers),
  }
}

describe('tuneRequestForSigning', () => {
  it('writes the content type netstack would otherwise invent, so the signer covers it', () => {
    for (const method of ['PUT', 'POST', 'DELETE']) {
      const message = request(method)
      tuneRequestForSigning(message)
      expect(message.headers.get('content-type')).toBe('application/json')
    }
  })

  it('leaves a content type the operation already set', () => {
    const message = request('DELETE', { 'Content-Type': 'application/xml' })
    tuneRequestForSigning(message)
    expect(message.headers.get('content-type')).toBe('application/xml')
  })

  it('leaves GET alone, which netstack does not default', () => {
    const message = request('GET')
    tuneRequestForSigning(message)
    expect(message.headers.get('content-type')).toBeUndefined()
  })
})

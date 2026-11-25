import { describe, expect, it } from 'vitest'
import type { Config } from '../../../src/config.js'
import { StaticCredentialsProvider } from '../../../src/credentials/static.js'
import { ClientImpl } from '../../../src/internal/client-impl.js'
import { TransportCapabilityType } from '../../../src/transport/types.js'
import { FeatureFlagsType, UrlStyleType, type OperationInput } from '../../../src/types.js'
import { createMockTransport, type MockTransport } from '../../fixtures/mock-transport.js'

function config(overrides?: Partial<Config>): Config {
  return {
    region: 'cn-hangzhou',
    credentialsProvider: new StaticCredentialsProvider('ak', 'sk'),
    transport: createMockTransport(),
    ...overrides,
  }
}

/** A recording transport that reports it fills a missing content type itself. */
function fillingTransport(): MockTransport {
  return Object.assign(createMockTransport(), { capabilities: [TransportCapabilityType.FILLS_CONTENT_TYPE] })
}

describe('ClientImpl', () => {
  // Built unconditionally so no send has to check a chain exists; the middleware reports a missing field.
  it('builds the default chain in order, whatever the config', () => {
    const chain = ['Retryer', 'Signer', 'ResponseChecker']
    expect(new ClientImpl(config(), []).innerOptions.stack.names()).toEqual(chain)
    expect(new ClientImpl({ region: 'cn-hangzhou' }, []).innerOptions.stack.names()).toEqual(chain)
  })

  // The default transport is a build-time-swapped import, so the platform that runs this is not named.
  it('defaults the transport to the one the platform provides', () => {
    const transport = createMockTransport()
    expect(new ClientImpl(config({ transport }), []).options.transport).toBe(transport)
    expect(new ClientImpl({ region: 'cn-hangzhou' }, []).options.transport).toBeDefined()
  })

  describe('featureFlags', () => {
    it('enables auto MIME detection by default', () => {
      expect(new ClientImpl(config(), []).options.featureFlags).toBe(FeatureFlagsType.AUTO_DETECT_MIME_TYPE)
    })

    it('clears auto MIME detection only when Config asks to disable it', () => {
      expect(new ClientImpl(config({ disableAutoDetectMimeType: false }), []).options.featureFlags).toBe(
        FeatureFlagsType.AUTO_DETECT_MIME_TYPE,
      )
      expect(new ClientImpl(config({ disableAutoDetectMimeType: true }), []).options.featureFlags).toBe(0)
    })

    it('lets a ClientOptionsFn replace resolved feature flags', () => {
      const impl = new ClientImpl(config(), [(options) => void (options.featureFlags = 0)])
      expect(impl.options.featureFlags).toBe(0)
    })
  })

  describe('urlStyle', () => {
    it('defaults to virtual-hosted', () => {
      expect(new ClientImpl(config(), []).innerOptions.urlStyle).toBe(UrlStyleType.VIRTUAL_HOSTED)
    })

    it('honours the flags in precedence order: cname, then path', () => {
      const cname = config({ useCname: true, usePathStyle: true })
      expect(new ClientImpl(cname, []).innerOptions.urlStyle).toBe(UrlStyleType.CNAME)
      const path = config({ usePathStyle: true })
      expect(new ClientImpl(path, []).innerOptions.urlStyle).toBe(UrlStyleType.PATH)
    })

    // An IP endpoint cannot carry a bucket in its host, so it overrides even an explicit flag.
    it('forces path style for an IP endpoint', () => {
      const ip = config({ endpoint: 'http://127.0.0.1:8080', useCname: true })
      expect(new ClientImpl(ip, []).innerOptions.urlStyle).toBe(UrlStyleType.PATH)
    })

    // The override runs after the functions, so one that sets a style on an IP endpoint loses.
    it('applies a ClientOptionsFn before the IP override', () => {
      const ip = config({ endpoint: 'http://127.0.0.1:8080' })
      const impl = new ClientImpl(ip, [(options) => void (options.urlStyle = UrlStyleType.CNAME)])
      expect(impl.options.urlStyle).toBe(UrlStyleType.CNAME)
      expect(impl.innerOptions.urlStyle).toBe(UrlStyleType.PATH)
    })
  })

  describe('fillContentType', () => {
    const put: OperationInput = { opName: 'PutObject', method: 'PUT', bucket: 'bucket', key: 'hello.txt' }

    it('settles an empty content type for a transport that reports filling one', async () => {
      const transport = fillingTransport()
      await new ClientImpl(config({ transport }), []).invokeOperation(put)

      expect(transport.requests[0].headers.get('content-type')).toBe('')
    })

    it('leaves the request alone for a transport that reports nothing', async () => {
      const transport = createMockTransport()
      await new ClientImpl(config({ transport }), []).invokeOperation(put)

      expect(transport.requests[0].headers.get('content-type')).toBeUndefined()
    })

    it('settles the content type whatever the method', async () => {
      const transport = fillingTransport()
      await new ClientImpl(config({ transport }), []).invokeOperation({ ...put, method: 'GET' })

      expect(transport.requests[0].headers.get('content-type')).toBe('')
    })

    it('keeps a content type the input already carries', async () => {
      const transport = fillingTransport()
      await new ClientImpl(config({ transport }), []).invokeOperation({ ...put, headers: { 'Content-Type': 'text/plain' } })

      expect(transport.requests[0].headers.get('content-type')).toBe('text/plain')
    })

    // A header the transport adds after signing is a header the service cannot match, so the
    // difference below has to reach the signature, not only the wire.
    it('signs the empty content type instead of adding it afterwards', async () => {
      const headers = { 'x-oss-date': 'Thu, 01 Jan 2026 00:00:00 GMT' }
      const filling = fillingTransport()
      const plain = createMockTransport()
      await new ClientImpl(config({ transport: filling }), []).invokeOperation({ ...put, headers })
      await new ClientImpl(config({ transport: plain }), []).invokeOperation({ ...put, headers })

      expect(filling.requests[0].headers.get('authorization')).not.toBe(plain.requests[0].headers.get('authorization'))
    })

    // Someone else sends a presigned url, and cannot be relied on to reproduce a header nobody asked for.
    it('keeps the content type out of a url the caller did not give one', async () => {
      const headers = { 'x-oss-date': 'Thu, 01 Jan 2026 00:00:00 GMT' }
      const filling = await new ClientImpl(config({ transport: fillingTransport() }), []).presignOperation({
        ...put,
        headers,
      })
      const plain = await new ClientImpl(config({ transport: createMockTransport() }), []).presignOperation({
        ...put,
        headers,
      })

      expect(filling.signedHeaders).not.toHaveProperty('Content-Type')
      expect(filling.url).toBe(plain.url)
    })
  })
})

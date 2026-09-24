import { describe, expect, it } from 'vitest'
import type { Config } from '../../../src/config.js'
import { StaticCredentialsProvider } from '../../../src/credentials/static.js'
import { ClientImpl } from '../../../src/internal/client-impl.js'
import { FeatureFlagsType, UrlStyleType } from '../../../src/types.js'
import { createMockTransport } from '../../fixtures/mock-transport.js'

function config(overrides?: Partial<Config>): Config {
  return {
    region: 'cn-hangzhou',
    credentialsProvider: new StaticCredentialsProvider('ak', 'sk'),
    transport: createMockTransport(),
    ...overrides,
  }
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
})

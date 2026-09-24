import { describe, expect, it, vi } from 'vitest'
import { AnonymousCredentialsProvider } from '../../../src/credentials/anonymous.js'
import { RefreshCredentialsProvider } from '../../../src/credentials/refresh.js'
import { StaticCredentialsProvider } from '../../../src/credentials/static.js'
import { hasKeys } from '../../../src/credentials/types.js'
import type { Credentials, CredentialsProvider } from '../../../src/credentials/types.js'
import { ParamRequiredError } from '../../../src/error/types.js'

function thrownBy(fn: () => unknown): unknown {
  try {
    fn()
    return undefined
  } catch (err) {
    return err
  }
}

describe('StaticCredentialsProvider', () => {
  it('returns what it was given', async () => {
    const provider = new StaticCredentialsProvider('ak', 'sk')
    const credentials = await provider.getCredentials()
    expect(credentials.accessKeyId).toBe('ak')
    expect(credentials.accessKeySecret).toBe('sk')
    expect(credentials.securityToken).toBeUndefined()
  })

  it('carries a security token when supplied', async () => {
    const credentials = await new StaticCredentialsProvider('ak', 'sk', 'token').getCredentials()
    expect(credentials.securityToken).toBe('token')
  })

  it('drops an empty security token rather than storing a second spelling for absent', async () => {
    const credentials = await new StaticCredentialsProvider('ak', 'sk', '').getCredentials()
    expect(credentials.securityToken).toBeUndefined()
  })

  it('rejects an empty access key id', () => {
    const err = thrownBy(() => new StaticCredentialsProvider('', 'sk'))
    expect(err).toBeInstanceOf(ParamRequiredError)
    expect(err instanceof ParamRequiredError ? err.field : '').toBe('accessKeyId')
  })

  it('rejects an empty access key secret', () => {
    const err = thrownBy(() => new StaticCredentialsProvider('ak', ''))
    expect(err).toBeInstanceOf(ParamRequiredError)
    expect(err instanceof ParamRequiredError ? err.field : '').toBe('accessKeySecret')
  })
})

describe('AnonymousCredentialsProvider', () => {
  it('yields empty credentials that hasKeys rejects', async () => {
    const credentials = await new AnonymousCredentialsProvider().getCredentials()
    expect(credentials.accessKeyId).toBe('')
    expect(credentials.accessKeySecret).toBe('')
    expect(hasKeys(credentials)).toBe(false)
  })
})

describe('hasKeys', () => {
  it('is true for real credentials', () => {
    expect(hasKeys({ accessKeyId: 'ak', accessKeySecret: 'sk' })).toBe(true)
  })

  it('is false when either key is missing, not just the id', () => {
    expect(hasKeys({ accessKeyId: 'ak', accessKeySecret: '' })).toBe(false)
    expect(hasKeys({ accessKeyId: '', accessKeySecret: 'sk' })).toBe(false)
  })
})

describe('RefreshCredentialsProvider', () => {
  it('fetches once and caches forever when the credentials never expire', async () => {
    let calls = 0
    const inner: CredentialsProvider = {
      getCredentials: () => {
        calls += 1
        return Promise.resolve({ accessKeyId: 'ak', accessKeySecret: 'sk' })
      },
    }
    const provider = new RefreshCredentialsProvider(inner)

    await provider.getCredentials()
    await provider.getCredentials()
    await provider.getCredentials()

    expect(calls).toBe(1)
  })

  it('serves a finite-expiration credential from cache while it is far from expiry', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2020-01-01T00:00:00Z'))
    try {
      let calls = 0
      const inner: CredentialsProvider = {
        getCredentials: () => {
          calls += 1
          return Promise.resolve({
            accessKeyId: 'ak',
            accessKeySecret: 'sk',
            securityToken: 'token',
            expiration: new Date(Date.now() + 3600_000),
          })
        },
      }
      // Expiry an hour out, threshold 300s: every call sits in the healthy branch, not the background
      // one, so the token is fetched once and its fields are carried through untouched.
      const provider = new RefreshCredentialsProvider(inner, 300)

      for (let i = 0; i < 10; i += 1) {
        const credentials = await provider.getCredentials()
        expect(credentials.accessKeyId).toBe('ak')
        expect(credentials.securityToken).toBe('token')
      }
      expect(calls).toBe(1)
    } finally {
      vi.useRealTimers()
    }
  })

  it('refetches once the cached credentials have expired', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2020-01-01T00:00:00Z'))
    try {
      let calls = 0
      const inner: CredentialsProvider = {
        getCredentials: () => {
          calls += 1
          return Promise.resolve({
            accessKeyId: 'ak' + String(calls),
            accessKeySecret: 'sk',
            expiration: new Date(Date.now() + 1000),
          })
        },
      }
      const provider = new RefreshCredentialsProvider(inner, 0)

      expect((await provider.getCredentials()).accessKeyId).toBe('ak1')
      vi.setSystemTime(Date.now() + 2000)
      expect((await provider.getCredentials()).accessKeyId).toBe('ak2')
      expect(calls).toBe(2)
    } finally {
      vi.useRealTimers()
    }
  })

  it('serves the still-valid cached value at once while refreshing in the background', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2020-01-01T00:00:00Z'))
    try {
      let calls = 0
      const inner: CredentialsProvider = {
        getCredentials: () => {
          calls += 1
          return Promise.resolve({
            accessKeyId: 'ak' + String(calls),
            accessKeySecret: 'sk',
            expiration: new Date(Date.now() + 400_000),
          })
        },
      }
      const provider = new RefreshCredentialsProvider(inner, 300)

      expect((await provider.getCredentials()).accessKeyId).toBe('ak1')
      // Within the 300s threshold of the 400s expiry: the call returns the cached value immediately,
      // but a background fetch is already under way (its provider call has run synchronously).
      vi.setSystemTime(Date.now() + 150_000)
      expect((await provider.getCredentials()).accessKeyId).toBe('ak1')
      expect(calls).toBe(2)

      // Let the background fetch settle, then a healthy call sees the refreshed value with no new fetch.
      await Promise.resolve()
      await Promise.resolve()
      await Promise.resolve()
      expect((await provider.getCredentials()).accessKeyId).toBe('ak2')
      expect(calls).toBe(2)
    } finally {
      vi.useRealTimers()
    }
  })

  it('collapses concurrent calls into a single fetch', async () => {
    let calls = 0
    let resolveFetch: (credentials: Credentials) => void = () => undefined
    const inner: CredentialsProvider = {
      getCredentials: () => {
        calls += 1
        return new Promise<Credentials>((resolve) => {
          resolveFetch = resolve
        })
      },
    }
    const provider = new RefreshCredentialsProvider(inner)

    const first = provider.getCredentials()
    const second = provider.getCredentials()
    const third = provider.getCredentials()
    expect(calls).toBe(1)

    resolveFetch({ accessKeyId: 'ak', accessKeySecret: 'sk' })
    const results = await Promise.all([first, second, third])
    expect(results[0].accessKeyId).toBe('ak')
    expect(results[1]).toBe(results[0])
    expect(results[2]).toBe(results[0])
    expect(calls).toBe(1)
  })

  it('keeps serving the valid cached value when a background refresh fails', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2020-01-01T00:00:00Z'))
    try {
      let calls = 0
      const inner: CredentialsProvider = {
        getCredentials: () => {
          calls += 1
          if (calls === 1) {
            return Promise.resolve({
              accessKeyId: 'ak1',
              accessKeySecret: 'sk',
              expiration: new Date(Date.now() + 400_000),
            })
          }
          return Promise.reject(new Error('provider down'))
        },
      }
      const provider = new RefreshCredentialsProvider(inner, 300)

      expect((await provider.getCredentials()).accessKeyId).toBe('ak1')
      vi.setSystemTime(Date.now() + 150_000)
      // The background refresh rejects, but the cached value is still valid and comes back unaffected.
      expect((await provider.getCredentials()).accessKeyId).toBe('ak1')
      expect(calls).toBe(2)

      await Promise.resolve()
      await Promise.resolve()
      await Promise.resolve()
    } finally {
      vi.useRealTimers()
    }
  })
})

// Not available on OpenHarmony: ArkTS forbids initialising a method-bearing interface from an
// object literal, so a caller there declares a class instead.
describe('a plain object as a provider', () => {
  it('satisfies the interface on node and browser', async () => {
    const provider: CredentialsProvider = {
      getCredentials: () => Promise.resolve({ accessKeyId: 'a', accessKeySecret: 'b' }),
    }
    expect((await provider.getCredentials()).accessKeyId).toBe('a')
  })
})

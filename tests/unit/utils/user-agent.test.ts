import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { SDK_NAME, SDK_VERSION, buildUserAgent } from '../../../src/utils/user-agent.js'

describe('buildUserAgent', () => {
  // Spells out the name literally; `SDK_NAME` on both sides would pass for any name.
  it('produces name/version when nothing else is known', () => {
    expect(buildUserAgent()).toBe('alibabacloud-ts-sdk-v2/' + SDK_VERSION)
  })

  it('appends the platform in parentheses', () => {
    expect(buildUserAgent('linux/-/x64;node20.11.0')).toBe(SDK_NAME + '/' + SDK_VERSION + ' (linux/-/x64;node20.11.0)')
  })

  it('appends a caller-supplied suffix after a slash', () => {
    expect(buildUserAgent('linux/-/x64;node20.11.0', 'my-app')).toBe(
      SDK_NAME + '/' + SDK_VERSION + ' (linux/-/x64;node20.11.0)/my-app',
    )
  })

  it('appends a caller-supplied suffix even with no platform', () => {
    expect(buildUserAgent(undefined, 'my-app')).toBe(SDK_NAME + '/' + SDK_VERSION + '/my-app')
  })

  it('ignores empty strings rather than emitting empty segments', () => {
    expect(buildUserAgent('', '')).toBe(SDK_NAME + '/' + SDK_VERSION)
  })

  it('keeps single-character segments', () => {
    expect(buildUserAgent('x', 'y')).toBe(SDK_NAME + '/' + SDK_VERSION + ' (x)/y')
  })
})

describe('SDK_VERSION', () => {
  it('matches the version in package.json', () => {
    const pkg = JSON.parse(readFileSync(new URL('../../../package.json', import.meta.url), 'utf8')) as {
      version: string
    }
    expect(SDK_VERSION).toBe(pkg.version)
  })
})

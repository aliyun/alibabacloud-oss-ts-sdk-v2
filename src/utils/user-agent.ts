/** The repo name minus `oss-`. */
export const SDK_NAME = 'alibabacloud-ts-sdk-v2'

/** Must equal `version` in package.json; `tests/unit/utils/user-agent.test.ts` enforces it. */
export const SDK_VERSION = '0.1.0-alpha.0'

/** Builds `<name>/<version> (<platform>)/<extra>`. The suffix is appended. */
export function buildUserAgent(platform?: string, extra?: string): string {
  let userAgent = SDK_NAME + '/' + SDK_VERSION
  if (platform !== undefined && platform.length > 0) userAgent += ' (' + platform + ')'
  if (extra !== undefined && extra.length > 0) userAgent += '/' + extra
  return userAgent
}

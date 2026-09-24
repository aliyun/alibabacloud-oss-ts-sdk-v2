import type { Credentials, CredentialsProvider } from './types.js'

const DEFAULT_REFRESH_THRESHOLD_SECONDS = 300

/**
 * Caches another provider's credentials and refreshes them near expiry. Credentials without an
 * expiration are fetched once and retained.
 */
export class RefreshCredentialsProvider implements CredentialsProvider {
  private readonly provider: CredentialsProvider
  private readonly thresholdMs: number
  private cached?: Credentials
  private expiresAt = 0
  // The in-flight credential fetch.
  private refreshing?: Promise<Credentials>

  constructor(provider: CredentialsProvider, refreshThresholdSeconds = DEFAULT_REFRESH_THRESHOLD_SECONDS) {
    this.provider = provider
    this.thresholdMs = refreshThresholdSeconds * 1000
  }

  getCredentials(): Promise<Credentials> {
    const now = Date.now()
    if (this.cached === undefined || now >= this.expiresAt) return this.refresh()
    // Within the threshold, return the cached value and refresh in the background.
    if (now >= this.expiresAt - this.thresholdMs) void this.refresh().catch(() => undefined)
    return Promise.resolve(this.cached)
  }

  private refresh(): Promise<Credentials> {
    if (this.refreshing === undefined) this.refreshing = this.fetch()
    return this.refreshing
  }

  private async fetch(): Promise<Credentials> {
    try {
      const credentials = await this.provider.getCredentials()
      this.cached = credentials
      this.expiresAt =
        credentials.expiration === undefined ? Number.POSITIVE_INFINITY : credentials.expiration.getTime()
      return credentials
    } finally {
      this.refreshing = undefined
    }
  }
}

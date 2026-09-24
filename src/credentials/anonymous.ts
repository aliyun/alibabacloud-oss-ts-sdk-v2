import type { Credentials, CredentialsProvider } from './types.js'

/**
 * Public-read access. Installing this provider is the only way to ask for unsigned requests:
 * `SignerMiddleware` tests for the class with `instanceof`, which does not see through a wrapper.
 */
export class AnonymousCredentialsProvider implements CredentialsProvider {
  getCredentials(): Promise<Credentials> {
    const credentials: Credentials = { accessKeyId: '', accessKeySecret: '' }
    return Promise.resolve(credentials)
  }
}

import { ParamRequiredError } from '../error/types.js'
import type { Credentials, CredentialsProvider } from './types.js'

/** A fixed pair of keys, optionally with an STS token. */
export class StaticCredentialsProvider implements CredentialsProvider {
  private readonly credentials: Credentials

  constructor(accessKeyId: string, accessKeySecret: string, securityToken?: string) {
    if (accessKeyId.length === 0) throw new ParamRequiredError('accessKeyId')
    if (accessKeySecret.length === 0) throw new ParamRequiredError('accessKeySecret')
    // An empty token is normalised to absent.
    const token = securityToken !== undefined && securityToken.length > 0 ? securityToken : undefined
    this.credentials = { accessKeyId, accessKeySecret, securityToken: token }
  }

  getCredentials(): Promise<Credentials> {
    return Promise.resolve(this.credentials)
  }
}

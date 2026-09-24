import * as process from 'node:process'
import type { Credentials, CredentialsProvider } from '../../credentials/types.js'
import { CredentialsError } from '../../error/types.js'

const ID_VARIABLE = 'OSS_ACCESS_KEY_ID'
const SECRET_VARIABLE = 'OSS_ACCESS_KEY_SECRET'
const TOKEN_VARIABLE = 'OSS_SESSION_TOKEN'

/**
 * Reads credentials from `OSS_ACCESS_KEY_ID`, `OSS_ACCESS_KEY_SECRET` and the optional
 * `OSS_SESSION_TOKEN` on every call.
 */
export class EnvironmentVariableCredentialsProvider implements CredentialsProvider {
  getCredentials(): Promise<Credentials> {
    const accessKeyId = process.env[ID_VARIABLE] ?? ''
    const accessKeySecret = process.env[SECRET_VARIABLE] ?? ''
    if (accessKeyId.length === 0 || accessKeySecret.length === 0) {
      return Promise.reject(
        new CredentialsError(ID_VARIABLE + ' and ' + SECRET_VARIABLE + ' must both be set and non-empty'),
      )
    }
    const securityToken = process.env[TOKEN_VARIABLE] ?? ''
    return Promise.resolve({
      accessKeyId,
      accessKeySecret,
      securityToken: securityToken.length > 0 ? securityToken : undefined,
    })
  }
}

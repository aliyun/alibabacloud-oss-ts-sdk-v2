import * as process from 'node:process'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { CredentialsError } from '../../../../src/error/types.js'
import { EnvironmentVariableCredentialsProvider } from '../../../../src/runtime/node/index.js'

describe('EnvironmentVariableCredentialsProvider', () => {
  const NAMES = ['OSS_ACCESS_KEY_ID', 'OSS_ACCESS_KEY_SECRET', 'OSS_SESSION_TOKEN']
  const saved = new Map<string, string | undefined>()

  // Touch only these three names: reassigning `process.env` wholesale replaces Node's own object.
  beforeEach(() => {
    for (const name of NAMES) {
      saved.set(name, process.env[name])
      delete process.env[name]
    }
  })

  afterEach(() => {
    for (const name of NAMES) {
      const value = saved.get(name)
      if (value === undefined) delete process.env[name]
      else process.env[name] = value
    }
  })

  it('reads all three variables', async () => {
    process.env.OSS_ACCESS_KEY_ID = 'ak'
    process.env.OSS_ACCESS_KEY_SECRET = 'sk'
    process.env.OSS_SESSION_TOKEN = 'token'

    expect(await new EnvironmentVariableCredentialsProvider().getCredentials()).toEqual({
      accessKeyId: 'ak',
      accessKeySecret: 'sk',
      securityToken: 'token',
    })
  })

  it('leaves securityToken undefined when the variable is unset', async () => {
    process.env.OSS_ACCESS_KEY_ID = 'ak'
    process.env.OSS_ACCESS_KEY_SECRET = 'sk'

    const credentials = await new EnvironmentVariableCredentialsProvider().getCredentials()
    expect(credentials.securityToken).toBeUndefined()
  })

  it('treats an empty securityToken as unset', async () => {
    process.env.OSS_ACCESS_KEY_ID = 'ak'
    process.env.OSS_ACCESS_KEY_SECRET = 'sk'
    process.env.OSS_SESSION_TOKEN = ''

    const credentials = await new EnvironmentVariableCredentialsProvider().getCredentials()
    expect(credentials.securityToken).toBeUndefined()
  })

  it('rejects when the access key id is missing', async () => {
    process.env.OSS_ACCESS_KEY_SECRET = 'sk'
    await expect(new EnvironmentVariableCredentialsProvider().getCredentials()).rejects.toBeInstanceOf(CredentialsError)
  })

  it('rejects when the access key secret is missing', async () => {
    process.env.OSS_ACCESS_KEY_ID = 'ak'
    await expect(new EnvironmentVariableCredentialsProvider().getCredentials()).rejects.toBeInstanceOf(CredentialsError)
  })

  it('names both variables in the error message', async () => {
    const error = await new EnvironmentVariableCredentialsProvider()
      .getCredentials()
      .then(() => undefined)
      .catch((err: unknown) => err as Error)
    expect(error?.message).toContain('OSS_ACCESS_KEY_ID')
    expect(error?.message).toContain('OSS_ACCESS_KEY_SECRET')
  })

  it('reads the environment on every call, not at construction', async () => {
    const provider = new EnvironmentVariableCredentialsProvider()
    await expect(provider.getCredentials()).rejects.toBeInstanceOf(CredentialsError)

    process.env.OSS_ACCESS_KEY_ID = 'late'
    process.env.OSS_ACCESS_KEY_SECRET = 'sk'
    expect((await provider.getCredentials()).accessKeyId).toBe('late')
  })
})

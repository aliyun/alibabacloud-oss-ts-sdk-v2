import { describe, expect, it } from 'vitest'
import type { ExecuteContext } from '../../../src/internal/execute-context.js'
import { AnonymousCredentialsProvider } from '../../../src/credentials/anonymous.js'
import { StaticCredentialsProvider } from '../../../src/credentials/static.js'
import type { Credentials, CredentialsProvider } from '../../../src/credentials/types.js'
import { CredentialsError, OssError, ParamRequiredError, RequestError } from '../../../src/error/types.js'
import type { Logger } from '../../../src/log/logger.js'
import { SignerMiddleware } from '../../../src/internal/signer-middleware.js'
import type { ExecuteMiddleware } from '../../../src/internal/execute-middleware.js'
import { SignerV1 } from '../../../src/signer/v1.js'
import type { RequestMessage, ResponseMessage } from '../../../src/transport/types.js'
import { executeContext } from '../../fixtures/execute-context.js'
import { createHeaderFields } from '../../../src/utils/header-fields.js'

const REQUEST_URL = 'https://examplebucket.oss-cn-hangzhou.aliyuncs.com/nelson'

function request(): RequestMessage {
  return { method: 'GET', url: REQUEST_URL, headers: createHeaderFields() }
}

function context(): ExecuteContext {
  const ctx = executeContext()
  ctx.signingContext.bucket = 'examplebucket'
  ctx.signingContext.key = 'nelson'
  return ctx
}

const innerResponse: ResponseMessage = { statusCode: 200, status: 'OK', headers: {} }

interface Seen {
  request: RequestMessage
  context: ExecuteContext
}

function stubNext(seen: Seen[]): ExecuteMiddleware {
  return {
    execute: (req, ctx) => {
      seen.push({ request: req, context: ctx })
      return Promise.resolve(innerResponse)
    },
  }
}

function signer(): SignerV1 {
  return new SignerV1()
}

function fixedProvider(accessKeyId: string, accessKeySecret: string): CredentialsProvider {
  return {
    getCredentials: () => {
      const credentials: Credentials = { accessKeyId, accessKeySecret }
      return Promise.resolve(credentials)
    },
  }
}

function recordingLogger(lines: string[]): Logger {
  return {
    debug: (message) => lines.push('debug ' + message),
    info: (message) => lines.push('info ' + message),
    warn: (message) => lines.push('warn ' + message),
    error: (message) => lines.push('error ' + message),
  }
}

// Counts the fetches an `AnonymousCredentialsProvider` receives.
class CountingAnonymousProvider extends AnonymousCredentialsProvider {
  calls = 0

  override getCredentials(): Promise<Credentials> {
    this.calls += 1
    return super.getCredentials()
  }
}

describe('SignerMiddleware', () => {
  it('signs with the fetched credentials and forwards the caller’s own request and context', async () => {
    const seen: Seen[] = []
    const req = request()
    const ctx = context()
    const middleware = new SignerMiddleware(stubNext(seen), signer(), new StaticCredentialsProvider('ak', 'sk'))
    const response = await middleware.execute(req, ctx)
    expect(req.headers.get('Authorization')).toMatch(/^OSS ak:/)
    expect(ctx.signingContext.credentials?.accessKeyId).toBe('ak')
    expect(ctx.signingContext.stringToSign).toContain('/examplebucket/nelson')
    expect(response).toBe(innerResponse)
    expect(seen.length).toBe(1)
    expect(seen[0].request).toBe(req)
    expect(seen[0].context).toBe(ctx)
  })

  it('skips signing entirely for an AnonymousCredentialsProvider, without fetching credentials', async () => {
    const seen: Seen[] = []
    const req = request()
    const ctx = context()
    const provider = new CountingAnonymousProvider()
    const response = await new SignerMiddleware(stubNext(seen), signer(), provider).execute(req, ctx)
    expect(provider.calls).toBe(0)
    expect(req.headers.get('Authorization')).toBeUndefined()
    expect(req.headers.get('Date')).toBeUndefined()
    expect(ctx.signingContext.stringToSign).toBe('')
    expect(ctx.signingContext.credentials).toBeUndefined()
    expect(response).toBe(innerResponse)
    expect(seen.length).toBe(1)
    expect(seen[0].request).toBe(req)
  })

  it('reports a missing provider, without sending', async () => {
    const seen: Seen[] = []
    const middleware = new SignerMiddleware(stubNext(seen), signer())
    await expect(middleware.execute(request(), context())).rejects.toBeInstanceOf(ParamRequiredError)
    expect(seen).toEqual([])
  })

  it('rejects fully keyless credentials from a non-anonymous provider, without sending', async () => {
    const seen: Seen[] = []
    const middleware = new SignerMiddleware(stubNext(seen), signer(), fixedProvider('', ''))
    const error: unknown = await middleware.execute(request(), context()).catch((e: unknown) => e)
    expect(error).toBeInstanceOf(CredentialsError)
    expect((error as CredentialsError).cause).toBeUndefined()
    expect(seen).toEqual([])
  })

  it('rejects credentials that have an id but no secret, without sending', async () => {
    const seen: Seen[] = []
    const middleware = new SignerMiddleware(stubNext(seen), signer(), fixedProvider('ak', ''))
    const error: unknown = await middleware.execute(request(), context()).catch((e: unknown) => e)
    expect(error).toBeInstanceOf(CredentialsError)
    expect((error as CredentialsError).cause).toBeUndefined()
    expect(seen).toEqual([])
  })

  it('wraps a provider rejection, keeping the original as cause, without sending', async () => {
    const seen: Seen[] = []
    const cause = new Error('STS endpoint unreachable')
    const provider: CredentialsProvider = { getCredentials: () => Promise.reject(cause) }
    const middleware = new SignerMiddleware(stubNext(seen), signer(), provider)
    const error: unknown = await middleware.execute(request(), context()).catch((e: unknown) => e)
    expect(error).toBeInstanceOf(CredentialsError)
    expect((error as CredentialsError).cause).toBe(cause)
    expect(seen).toEqual([])
  })

  it('gives a non-Error thrown by a provider a stand-in cause rather than dropping it', async () => {
    const seen: Seen[] = []
    const provider: CredentialsProvider = {
      getCredentials: () => {
        // eslint-disable-next-line @typescript-eslint/only-throw-error
        throw 'nope'
      },
    }
    const middleware = new SignerMiddleware(stubNext(seen), signer(), provider)
    const error: unknown = await middleware.execute(request(), context()).catch((e: unknown) => e)
    expect(error).toBeInstanceOf(CredentialsError)
    expect((error as CredentialsError).cause).toBeInstanceOf(OssError)
    expect(seen).toEqual([])
  })

  it('lets a rejection from the next middleware through untouched', async () => {
    const failure = new RequestError('socket hang up')
    const rejecting: ExecuteMiddleware = { execute: () => Promise.reject(failure) }
    const middleware = new SignerMiddleware(rejecting, signer(), new StaticCredentialsProvider('ak', 'sk'))
    await expect(middleware.execute(request(), context())).rejects.toBe(failure)
  })

  it('logs the string to sign at debug, after signing', async () => {
    const lines: string[] = []
    const middleware = new SignerMiddleware(
      stubNext([]),
      signer(),
      new StaticCredentialsProvider('ak', 'sk'),
      recordingLogger(lines),
    )
    await middleware.execute(request(), context())
    expect(lines.length).toBe(1)
    expect(lines[0].startsWith('debug stringToSign:')).toBe(true)
    expect(lines[0]).toContain('/examplebucket/nelson')
  })

  it('logs nothing for an anonymous provider', async () => {
    const lines: string[] = []
    const middleware = new SignerMiddleware(
      stubNext([]),
      signer(),
      new AnonymousCredentialsProvider(),
      recordingLogger(lines),
    )
    await middleware.execute(request(), context())
    expect(lines).toEqual([])
  })
})

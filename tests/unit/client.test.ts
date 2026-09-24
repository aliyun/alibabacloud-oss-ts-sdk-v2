import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Client } from '../../src/client.js'
import type { Config } from '../../src/config.js'
import { AnonymousCredentialsProvider } from '../../src/credentials/anonymous.js'
import { StaticCredentialsProvider } from '../../src/credentials/static.js'
import type { CredentialsProvider } from '../../src/credentials/types.js'
import {
  CanceledError,
  CredentialsError,
  OperationError,
  ParamInvalidError,
  ParamRequiredError,
  ServiceError,
} from '../../src/error/types.js'
import type { Logger } from '../../src/log/logger.js'
import { SignerV4 } from '../../src/signer/v4.js'
import { FeatureFlagsType } from '../../src/types.js'
import type { OperationInput, OperationOutput, Presignable, UrlStyleType } from '../../src/types.js'
import { addMimeType } from '../../src/utils/mime-type.js'
import { buildUserAgent } from '../../src/utils/user-agent.js'
import { controllableSignal } from '../fixtures/abort-signal.js'
import { createMockTransport } from '../fixtures/mock-transport.js'
import type { MockTransport } from '../fixtures/mock-transport.js'

// The instant every `x-oss-date` assertion below is written against; the signers read the system clock.
const SIGN_TIME = new Date(Date.UTC(2022, 11, 28, 10, 27, 41))

// `Date` alone, not the timers: the retry backoff waits on a real `setTimeout`, so faking timers
// would stall every case that retries.
beforeEach(() => {
  vi.useFakeTimers({ now: SIGN_TIME, toFake: ['Date'] })
})

afterEach(() => {
  vi.useRealTimers()
})

function config(overrides: Partial<Config> = {}): Config {
  return {
    region: 'cn-hangzhou',
    credentialsProvider: new StaticCredentialsProvider('ak', 'sk'),
    transport: createMockTransport(),
    ...overrides,
  }
}

function getObject(overrides: Partial<OperationInput> = {}): OperationInput {
  return { opName: 'GetObject', method: 'GET', bucket: 'bucket', key: 'dir/key.txt', ...overrides }
}

function recordingLogger(lines: string[]): Logger {
  return {
    debug: (message) => lines.push('debug ' + message),
    info: (message) => lines.push('info ' + message),
    warn: (message) => lines.push('warn ' + message),
    error: (message) => lines.push('error ' + message),
  }
}

interface EchoInput {
  bucket: string
  key: string
}

interface EchoOutput {
  statusCode: number
  text: string
}

class EchoCommand implements Presignable<EchoInput, EchoOutput> {
  readonly opName = 'Echo'
  readonly input: EchoInput
  readonly seen: string[] = []

  constructor(input: EchoInput) {
    this.input = input
  }

  serialize(input: EchoInput): Promise<OperationInput> {
    this.seen.push('serialize')
    return Promise.resolve({ opName: 'Echo', method: 'GET', bucket: input.bucket, key: input.key })
  }

  serializePresign(input: EchoInput): Promise<OperationInput> {
    this.seen.push('serializePresign')
    return Promise.resolve({ opName: 'Echo', method: 'GET', bucket: input.bucket, key: input.key })
  }

  async deserialize(output: OperationOutput): Promise<EchoOutput> {
    this.seen.push('deserialize')
    return { statusCode: output.statusCode, text: output.body === undefined ? '' : await output.body.text() }
  }
}

class PresignableInput implements Presignable<OperationInput, OperationOutput> {
  readonly opName: string
  readonly input: OperationInput

  constructor(input: OperationInput) {
    this.opName = input.opName
    this.input = input
  }

  serialize(input: OperationInput): Promise<OperationInput> {
    return Promise.resolve(input)
  }

  serializePresign(input: OperationInput): Promise<OperationInput> {
    return Promise.resolve(input)
  }

  deserialize(output: OperationOutput): Promise<OperationOutput> {
    return Promise.resolve(output)
  }
}

const SKEW_BODY =
  '<?xml version="1.0" encoding="UTF-8"?><Error><Code>RequestTimeTooSkewed</Code>' +
  '<Message>skewed</Message><RequestId>req-1</RequestId></Error>'

const NOT_FOUND_BODY =
  '<?xml version="1.0" encoding="UTF-8"?><Error><Code>NoSuchKey</Code>' +
  '<Message>The specified key does not exist.</Message>' +
  '<RequestId>req-body</RequestId><EC>0026-00000001</EC></Error>'

describe('Client construction', () => {
  it('never throws, however broken the config is', () => {
    expect(() => new Client({})).not.toThrow()
    expect(() => new Client({ endpoint: 'not a host' })).not.toThrow()
  })

  it('rethrows the stored error on every call, not just the first', async () => {
    const client = new Client({ transport: createMockTransport() })
    await expect(client.invokeOperation(getObject())).rejects.toBeInstanceOf(ParamRequiredError)
    await expect(client.invokeOperation(getObject())).rejects.toBeInstanceOf(ParamRequiredError)
  })

  it('reports an unusable endpoint as an invalid parameter', async () => {
    const client = new Client(config({ endpoint: 'ftp://example.com', region: undefined }))
    await expect(client.invokeOperation(getObject())).rejects.toThrow('invalid field, Config.endpoint')
  })

  // A config that names no transport gets the platform's own, so only an options fn can leave a
  // client without one (or being on OpenHarmony, which has no default).
  it('reports a transport an options fn removed', async () => {
    const client = new Client(config(), (options) => {
      options.transport = undefined
    })
    await expect(client.invokeOperation(getObject())).rejects.toThrow('missing required field, Config.transport')
  })

  it('reports a missing credentials provider', async () => {
    const client = new Client(config({ credentialsProvider: undefined }))
    await expect(client.invokeOperation(getObject())).rejects.toThrow(
      'missing required field, Config.credentialsProvider',
    )
  })

  // An endpoint is enough on its own: `region` exists to derive one, and nothing in the SDK requires it.
  it('sends with an endpoint and no region', async () => {
    const transport = createMockTransport()
    const client = new Client(config({ region: undefined, endpoint: 'oss-cn-hangzhou.aliyuncs.com', transport }))
    await client.invokeOperation(getObject())
    expect(transport.requests[0].url).toBe('https://bucket.oss-cn-hangzhou.aliyuncs.com/dir/key.txt')
  })

  it('lets a ClientOptionsFn fill in a field the config is missing', async () => {
    const transport = createMockTransport()
    const client = new Client(config({ region: undefined, transport }), (options) => {
      options.endpoint = 'https://oss-cn-hangzhou.aliyuncs.com'
    })
    await client.invokeOperation(getObject())
    expect(transport.requests[0].url).toBe('https://bucket.oss-cn-hangzhou.aliyuncs.com/dir/key.txt')
  })

  it('applies the ClientOptionsFns in order', async () => {
    const transport = createMockTransport()
    const client = new Client(
      config({ transport }),
      (options) => {
        options.endpoint = 'https://first.example.com'
      },
      (options) => {
        options.endpoint = 'https://second.example.com'
      },
    )
    await client.invokeOperation(getObject())
    expect(transport.requests[0].url).toBe('https://bucket.second.example.com/dir/key.txt')
  })

  it('accepts a v1 signer with no region', async () => {
    const transport = createMockTransport()
    const client = new Client(
      config({ region: undefined, endpoint: 'oss-cn-hangzhou.aliyuncs.com', signerVersion: 'v1', transport }),
    )
    await client.invokeOperation(getObject())
    expect(transport.requests[0].headers.get('Authorization')).toMatch(/^OSS ak:/)
  })
})

describe('invokeOperation', () => {
  it('derives the endpoint from the region and addresses the bucket virtual-hosted', async () => {
    const transport = createMockTransport()
    await new Client(config({ transport })).invokeOperation(getObject())
    expect(transport.requests[0].url).toBe('https://bucket.oss-cn-hangzhou.aliyuncs.com/dir/key.txt')
  })

  it('honours usePathStyle and disableSsl', async () => {
    const transport = createMockTransport()
    await new Client(config({ transport, usePathStyle: true, disableSsl: true })).invokeOperation(getObject())
    expect(transport.requests[0].url).toBe('http://oss-cn-hangzhou.aliyuncs.com/bucket/dir/key.txt')
  })

  // An IP cannot carry a bucket in the host, so it overrides the flag rather than losing to it.
  it('forces path style for an IP endpoint even when a flag asks for another', async () => {
    const transport = createMockTransport()
    await new Client(
      config({ transport, endpoint: 'http://127.0.0.1:8080', region: undefined, useCname: true, signerVersion: 'v1' }),
    ).invokeOperation(getObject())
    expect(transport.requests[0].url).toBe('http://127.0.0.1:8080/bucket/dir/key.txt')
  })

  // Without the trailing slash OSS reads the bucket segment as an object key.
  it('ends a path-style bucket operation in a slash', async () => {
    const transport = createMockTransport()
    await new Client(config({ transport, usePathStyle: true })).invokeOperation(getObject({ key: undefined }))
    expect(transport.requests[0].url).toBe('https://oss-cn-hangzhou.aliyuncs.com/bucket/')
  })

  it('produces a bare slash for a bucket or service operation', async () => {
    const bucketOp = createMockTransport()
    await new Client(config({ transport: bucketOp })).invokeOperation(getObject({ key: undefined }))
    expect(bucketOp.requests[0].url).toBe('https://bucket.oss-cn-hangzhou.aliyuncs.com/')
    const serviceOp = createMockTransport()
    await new Client(config({ transport: serviceOp })).invokeOperation(
      getObject({ bucket: undefined, key: undefined }),
    )
    expect(serviceOp.requests[0].url).toBe('https://oss-cn-hangzhou.aliyuncs.com/')
  })

  it('percent-encodes the key but not its slashes', async () => {
    const transport = createMockTransport()
    await new Client(config({ transport })).invokeOperation(getObject({ key: 'a b/中文+x.txt' }))
    expect(transport.requests[0].url).toBe(
      'https://bucket.oss-cn-hangzhou.aliyuncs.com/a%20b/%E4%B8%AD%E6%96%87%2Bx.txt',
    )
  })

  it('addresses a style that is no UrlStyleType virtual-hosted', async () => {
    const transport = createMockTransport()
    await new Client(config({ transport }), (options) => {
      options.urlStyle = 99 as UrlStyleType
    }).invokeOperation(getObject())
    expect(transport.requests[0].url).toBe('https://bucket.oss-cn-hangzhou.aliyuncs.com/dir/key.txt')
  })

  it('honours useCname by leaving the endpoint host alone', async () => {
    const transport = createMockTransport()
    await new Client(config({ transport, endpoint: 'cdn.example.com', useCname: true })).invokeOperation(getObject())
    expect(transport.requests[0].url).toBe('https://cdn.example.com/dir/key.txt')
  })

  // Precedence: internal, then dualstack, then accelerate, then public.
  it('prefers the internal endpoint over the accelerate one', async () => {
    const transport = createMockTransport()
    await new Client(config({ transport, useInternalEndpoint: true, useAccelerateEndpoint: true })).invokeOperation(
      getObject(),
    )
    expect(transport.requests[0].url).toBe('https://bucket.oss-cn-hangzhou-internal.aliyuncs.com/dir/key.txt')
  })

  // Dualstack puts the region first; accelerate drops it from the host.
  it('derives the dualstack and accelerate hosts from the region', async () => {
    const dualstack = createMockTransport()
    await new Client(
      config({ transport: dualstack, region: 'cn-shenzhen', useDualStackEndpoint: true }),
    ).invokeOperation(getObject())
    expect(dualstack.requests[0].url).toBe('https://bucket.cn-shenzhen.oss.aliyuncs.com/dir/key.txt')
    const accelerate = createMockTransport()
    await new Client(config({ transport: accelerate, useAccelerateEndpoint: true })).invokeOperation(getObject())
    expect(accelerate.requests[0].url).toBe('https://bucket.oss-accelerate.aliyuncs.com/dir/key.txt')
  })

  // `endpoint` decides the host, `region` keeps feeding the V4 scope: the signed region is the
  // configured one, not the host's.
  it('addresses the given endpoint while still signing the configured region', async () => {
    const transport = createMockTransport()
    await new Client(config({ transport, endpoint: 'https://oss-cn-beijing.aliyuncs.com' })).invokeOperation(
      getObject(),
    )
    const sent = transport.requests[0]
    expect(sent.url).toBe('https://bucket.oss-cn-beijing.aliyuncs.com/dir/key.txt')
    expect(sent.headers.get('Authorization')).toContain('Credential=ak/20221228/cn-hangzhou/oss/aliyun_v4_request')
  })

  it('keeps the endpoint port in the URL', async () => {
    const transport = createMockTransport()
    await new Client(config({ transport, endpoint: 'http://oss-cn-hangzhou.aliyuncs.com:8080' })).invokeOperation(
      getObject(),
    )
    expect(transport.requests[0].url).toBe('http://bucket.oss-cn-hangzhou.aliyuncs.com:8080/dir/key.txt')
  })

  it('sets the User-Agent and signs the request', async () => {
    const transport = createMockTransport()
    await new Client(config({ transport, userAgent: 'my-app' })).invokeOperation(getObject())
    expect(transport.requests[0].headers.get('User-Agent')).toContain('/my-app')
    expect(transport.requests[0].headers.get('Authorization')).toMatch(/^OSS4-HMAC-SHA256 Credential=ak\//)
  })

  // `signerVersion` is a plain string: only `v1` names V1, everything else resolves to v4.
  it('signs with v4 for a signerVersion it does not recognise', async () => {
    const transport = createMockTransport()
    await new Client(config({ transport, signerVersion: 'v9' })).invokeOperation(getObject())
    expect(transport.requests[0].headers.get('Authorization')).toMatch(/^OSS4-HMAC-SHA256 /)
  })

  it('prefers Config.signer over signerVersion', async () => {
    const transport = createMockTransport()
    await new Client(config({ transport, signerVersion: 'v1', signer: new SignerV4() })).invokeOperation(getObject())
    expect(transport.requests[0].headers.get('Authorization')).toMatch(/^OSS4-HMAC-SHA256 /)
  })

  it('carries Config.additionalHeaders into the signature', async () => {
    const transport = createMockTransport()
    await new Client(config({ transport, additionalHeaders: ['x-app-id'] })).invokeOperation(
      getObject({ headers: { 'x-app-id': 'app' } }),
    )
    expect(transport.requests[0].headers.get('Authorization')).toContain(',AdditionalHeaders=x-app-id,')
  })

  // `product` is reachable only through an options fn.
  it('signs the scope with a product a ClientOptionsFn changed', async () => {
    const transport = createMockTransport()
    await new Client(config({ transport }), (options) => {
      options.product = 'oss-cloudbox'
    }).invokeOperation(getObject())
    expect(transport.requests[0].headers.get('Authorization')).toContain(
      'Credential=ak/20221228/cn-hangzhou/oss-cloudbox/aliyun_v4_request',
    )
  })

  // Decided by the provider's class: nothing signing-related reaches the wire, not even the date.
  it('sends nothing signed for an AnonymousCredentialsProvider', async () => {
    const transport = createMockTransport()
    await new Client(config({ transport, credentialsProvider: new AnonymousCredentialsProvider() })).invokeOperation(
      getObject(),
    )
    const names = Object.keys(transport.requests[0].headers.toRecord()).map((name) => name.toLowerCase())
    expect(names).not.toContain('authorization')
    expect(names).not.toContain('x-oss-date')
  })

  it('replaces a caller-supplied User-Agent whatever its casing', async () => {
    const transport = createMockTransport()
    await new Client(config({ transport })).invokeOperation(getObject({ headers: { 'user-agent': 'caller' } }))
    const sent = transport.requests[0].headers.toRecord()
    const spellings = Object.keys(sent).filter((name) => name.toLowerCase() === 'user-agent')
    expect(spellings).toHaveLength(1)
    expect(sent[spellings[0]]).toBe(buildUserAgent())
  })

  // The mock clock is 28 Dec 2022, so a different day proves the signer used the caller's instant.
  it('signs at a caller-supplied x-oss-date rather than the current time', async () => {
    const transport = createMockTransport()
    await new Client(config({ transport })).invokeOperation(
      getObject({ headers: { 'x-oss-date': 'Sat, 31 Dec 2022 00:00:00 GMT' } }),
    )
    const sent = transport.requests[0].headers.toRecord()
    expect(sent['x-oss-date']).toBe('20221231T000000Z')
    expect(sent['Authorization']).toContain('Credential=ak/20221231/cn-hangzhou/oss/aliyun_v4_request')
  })

  it('passes unmodelled headers and parameters straight through', async () => {
    const transport = createMockTransport()
    await new Client(config({ transport })).invokeOperation(
      getObject({ headers: { 'x-oss-custom': 'v' }, parameters: { versionId: '7' } }),
    )
    expect(transport.requests[0].headers.get('x-oss-custom')).toBe('v')
    expect(transport.requests[0].url).toContain('?versionId=7')
  })

  // A bare `?` would change the string the signer canonicalizes.
  it('omits the question mark when parameters is empty', async () => {
    const transport = createMockTransport()
    await new Client(config({ transport })).invokeOperation(getObject({ parameters: {} }))
    expect(transport.requests[0].url).toBe('https://bucket.oss-cn-hangzhou.aliyuncs.com/dir/key.txt')
  })

  it('rejects an invalid bucket name before sending anything', async () => {
    const transport = createMockTransport()
    const client = new Client(config({ transport }))
    await expect(client.invokeOperation(getObject({ bucket: 'Bad_Bucket' }))).rejects.toBeInstanceOf(
      ParamInvalidError,
    )
    expect(transport.requests).toHaveLength(0)
  })

  it('rejects an empty key before sending anything', async () => {
    const transport = createMockTransport()
    const client = new Client(config({ transport }))
    await expect(client.invokeOperation(getObject({ key: '' }))).rejects.toThrow('invalid field, key')
    expect(transport.requests).toHaveLength(0)
  })

  it('returns the response envelope', async () => {
    const transport = createMockTransport({
      responses: [{ statusCode: 200, status: 'OK', headers: { 'x-oss-request-id': 'req-9' }, body: 'hello' }],
    })
    const output = await new Client(config({ transport })).invokeOperation(getObject())
    expect(output.statusCode).toBe(200)
    expect(output.status).toBe('OK')
    expect(output.headers['x-oss-request-id']).toBe('req-9')
    expect(output.input.opName).toBe('GetObject')
    expect(await output.body?.text()).toBe('hello')
  })

  it('wraps a chain failure in an OperationError that keeps the cause', async () => {
    const transport = createMockTransport({ responses: [{ statusCode: 404, body: '' }] })
    const client = new Client(config({ transport, retryMaxAttempts: 1 }))
    const error = await client.invokeOperation(getObject()).catch((err: unknown) => err)
    expect(error).toBeInstanceOf(OperationError)
    expect((error as OperationError).opName).toBe('GetObject')
    expect((error as OperationError).message).toContain('operation error GetObject')
    expect((error as OperationError).cause?.name).toBe('ServiceError')
  })

  // The requestId comes from the body, not the header, so a proxy's own id loses to the service's.
  it('reaches the ServiceError fields through the wrapping OperationError', async () => {
    const transport = createMockTransport({
      responses: [{ statusCode: 404, headers: { 'x-oss-request-id': 'req-header' }, body: NOT_FOUND_BODY }],
    })
    const client = new Client(config({ transport, retryMaxAttempts: 1 }))
    const error = await client.invokeOperation(getObject()).catch((err: unknown) => err)
    const service = (error as OperationError).contains((err) => err instanceof ServiceError)
    expect(service).toBeInstanceOf(ServiceError)
    expect((service as ServiceError).statusCode).toBe(404)
    expect((service as ServiceError).code).toBe('NoSuchKey')
    expect((service as ServiceError).requestId).toBe('req-body')
    expect((service as ServiceError).ec).toBe('0026-00000001')
    expect((service as ServiceError).requestTarget).toBe(
      'GET https://bucket.oss-cn-hangzhou.aliyuncs.com/dir/key.txt',
    )
  })

  it('takes retryMaxAttempts from the config when the request options name none', async () => {
    const transport = createMockTransport({ responses: [{ statusCode: 500, body: '' }] })
    const client = new Client(config({ transport, retryMaxAttempts: 2 }))
    await client.invokeOperation(getObject()).catch(() => undefined)
    expect(transport.requests).toHaveLength(2)
  })

  it('takes retryMaxAttempts from the request options over the config', async () => {
    const transport = createMockTransport({ responses: [{ statusCode: 500, body: '' }] })
    const client = new Client(config({ transport, retryMaxAttempts: 5 }))
    await client.invokeOperation(getObject(), { retryMaxAttempts: 2 }).catch(() => undefined)
    expect(transport.requests).toHaveLength(2)
  })

  // Zero is a value: `??` passes it through where `||` would silently restore the config's 5.
  it('sends once when the request options ask for zero attempts', async () => {
    const transport = createMockTransport({ responses: [{ statusCode: 500, body: '' }] })
    const client = new Client(config({ transport, retryMaxAttempts: 5 }))
    await client.invokeOperation(getObject(), { retryMaxAttempts: 0 }).catch(() => undefined)
    expect(transport.requests).toHaveLength(1)
  })

  // `Config.readWriteTimeoutMs` configures the transport the client builds; this client was handed
  // one, so only the per-request override travels.
  it('passes the request read/write override down to the transport', async () => {
    const transport = createMockTransport()
    await new Client(config({ transport, readWriteTimeoutMs: 1_000 })).invokeOperation(getObject(), {
      readWriteTimeoutMs: 2_000,
    })
    expect(transport.sendOptions[0].readWriteTimeoutMs).toBe(2_000)
  })

  // The idle deadline that does have a default is the transport's, not a send's; a total budget for
  // the call rides on `signal`, which the config named none of here.
  it('sends no read/write deadline when the config named none', async () => {
    const transport = createMockTransport()
    await new Client(config({ transport })).invokeOperation(getObject())
    expect(transport.sendOptions[0].readWriteTimeoutMs).toBeUndefined()
  })

  // A truthiness guard would drop this and leave the transport's own deadline in force.
  it('passes a zero readWriteTimeoutMs down rather than dropping it', async () => {
    const transport = createMockTransport()
    await new Client(config({ transport, readWriteTimeoutMs: 1_000 })).invokeOperation(getObject(), {
      readWriteTimeoutMs: 0,
    })
    expect(transport.sendOptions[0].readWriteTimeoutMs).toBe(0)
  })

  it('carries the response-stream marker down to the transport', async () => {
    const transport = createMockTransport()
    await new Client(config({ transport })).invokeOperation(
      getObject({ opMetadata: { 'response-stream': true } }),
    )
    expect(transport.sendOptions[0].responseStream).toBe(true)
  })

  it('carries an explicit false response-stream marker to the transport', async () => {
    const transport = createMockTransport()
    await new Client(config({ transport })).invokeOperation(
      getObject({ opMetadata: { 'response-stream': false } }),
    )
    expect(transport.sendOptions[0].responseStream).toBe(false)
  })

  // Absent resolves to `undefined`; the transport buffers by default.
  it('resolves an absent marker to undefined', async () => {
    const transport = createMockTransport()
    await new Client(config({ transport })).invokeOperation(getObject())
    expect(transport.sendOptions[0].responseStream).toBeUndefined()
  })

  it('converts the string true response-stream marker to boolean true', async () => {
    const transport = createMockTransport()
    await new Client(config({ transport })).invokeOperation(
      getObject({ opMetadata: { 'response-stream': 'true' } }),
    )
    expect(transport.sendOptions[0].responseStream).toBe(true)
  })

  // A non-boolean value does not count; the transport buffers by default.
  it('resolves a non-boolean marker to undefined', async () => {
    const transport = createMockTransport()
    await new Client(config({ transport })).invokeOperation(getObject({ opMetadata: { 'response-stream': 1 } }))
    expect(transport.sendOptions[0].responseStream).toBeUndefined()
  })

  it('resolves the string false response-stream marker to undefined', async () => {
    const transport = createMockTransport()
    await new Client(config({ transport })).invokeOperation(
      getObject({ opMetadata: { 'response-stream': 'false' } }),
    )
    expect(transport.sendOptions[0].responseStream).toBeUndefined()
  })

  // `buildContext` carries `OperationOptions.signal` into the chain; drop it and a caller's
  // cancellation is silently accepted then ignored.
  it('carries the signal the caller supplied down to the transport', async () => {
    const transport = createMockTransport()
    const controllable = controllableSignal()
    await new Client(config({ transport })).invokeOperation(getObject(), { signal: controllable.signal })
    expect(transport.sendOptions[0].signal).toBe(controllable.signal)
  })

  it('sends nothing when the signal the caller supplied has already fired', async () => {
    const transport = createMockTransport()
    const controllable = controllableSignal()
    controllable.abort()
    const error = await new Client(config({ transport }))
      .invokeOperation(getObject(), { signal: controllable.signal })
      .catch((err: unknown) => err)
    expect(error).toBeInstanceOf(OperationError)
    expect((error as OperationError).contains((err) => err instanceof CanceledError)).toBeInstanceOf(CanceledError)
    expect(transport.requests).toHaveLength(0)
  })

  it('remembers a corrected clock offset for later requests', async () => {
    const transport: MockTransport = createMockTransport({
      responses: [
        { statusCode: 403, headers: { Date: 'Wed, 28 Dec 2022 11:27:41 GMT' }, body: SKEW_BODY },
        { statusCode: 200, body: '' },
      ],
    })
    const client = new Client(config({ transport }))

    await client.invokeOperation(getObject())
    await client.invokeOperation(getObject())

    // Asserted on the second call's request: the retry re-signs the first in place, so `requests[0]`
    // and `requests[1]` are one object showing only the last signature.
    expect(transport.requests[2].headers.get('x-oss-date')).toBe('20221228T112741Z')
  })

  // The offset write sits in a `finally`, so a fully-failed request still teaches the client the offset.
  it('remembers the offset even when every attempt failed', async () => {
    const transport: MockTransport = createMockTransport({
      responses: [{ statusCode: 403, headers: { Date: 'Wed, 28 Dec 2022 11:27:41 GMT' }, body: SKEW_BODY }],
    })
    const client = new Client(config({ transport, retryMaxAttempts: 1 }))

    await expect(client.invokeOperation(getObject())).rejects.toBeInstanceOf(OperationError)
    await expect(client.invokeOperation(getObject())).rejects.toBeInstanceOf(OperationError)

    expect(transport.requests.map((request) => request.headers.get('x-oss-date'))).toEqual([
      '20221228T102741Z',
      '20221228T112741Z',
    ])
  })

  it('logs a corrected clock offset once, not on every later request', async () => {
    const lines: string[] = []
    const transport: MockTransport = createMockTransport({
      responses: [
        { statusCode: 403, headers: { Date: 'Wed, 28 Dec 2022 11:27:41 GMT' }, body: SKEW_BODY },
        { statusCode: 200, body: '' },
      ],
    })
    const client = new Client(config({ transport, logger: recordingLogger(lines) }))

    await client.invokeOperation(getObject())
    await client.invokeOperation(getObject())

    const corrections = lines.filter((line) => line.indexOf('Corrected the client clock offset') >= 0)
    expect(corrections).toEqual(['warn Corrected the client clock offset to 3600000ms'])
  })
})

describe('deferred Content-Type detection', () => {
  function upload(overrides: Partial<OperationInput> = {}): OperationInput {
    return {
      opName: 'PutObject',
      method: 'PUT',
      bucket: 'bucket',
      key: 'object',
      opMetadata: { detect_content_type: true },
      ...overrides,
    }
  }

  it('adds a detected type or the binary fallback only as it builds a sent request', async () => {
    const transport = createMockTransport()
    const client = new Client(config({ transport }))

    await client.invokeOperation(upload({ key: 'image.png' }))
    await client.invokeOperation(upload())

    expect(transport.requests[0].headers.get('Content-Type')).toBe('image/png')
    expect(transport.requests[1].headers.get('Content-Type')).toBe('application/octet-stream')
  })

  it('uses a global user MIME mapping at request construction', async () => {
    addMimeType({ deferredmime: 'application/x-deferred-mime' })
    const transport = createMockTransport()

    await new Client(config({ transport })).invokeOperation(upload({ key: 'object.DEFERREDMIME' }))

    expect(transport.requests[0].headers.get('Content-Type')).toBe('application/x-deferred-mime')
  })

  it('leaves an explicit Content-Type untouched', async () => {
    const transport = createMockTransport()

    await new Client(config({ transport })).invokeOperation(
      upload({ key: 'image.png', headers: { 'CONTENT-TYPE': 'text/plain' } }),
    )

    expect(transport.requests[0].headers.get('Content-Type')).toBe('text/plain')
  })

  it('does not add a type when Config disables the feature', async () => {
    const transport = createMockTransport()

    await new Client(config({ transport, disableAutoDetectMimeType: true })).invokeOperation(upload({ key: 'image.png' }))

    expect(transport.requests[0].headers.get('Content-Type')).toBeUndefined()
  })

  it('honours a ClientOptionsFn that clears the feature bit', async () => {
    const transport = createMockTransport()
    const client = new Client(config({ transport }), (options) => {
      options.featureFlags &= ~FeatureFlagsType.AUTO_DETECT_MIME_TYPE
    })

    await client.invokeOperation(upload({ key: 'image.png' }))

    expect(transport.requests[0].headers.get('Content-Type')).toBeUndefined()
  })
})

describe('send', () => {
  it('runs serialize, invokeOperation and deserialize in order', async () => {
    const transport = createMockTransport({ responses: [{ statusCode: 200, body: 'payload' }] })
    const command = new EchoCommand({ bucket: 'bucket', key: 'dir/key.txt' })
    const result = await new Client(config({ transport })).send(command)

    expect(result).toEqual({ statusCode: 200, text: 'payload' })
    expect(command.seen).toEqual(['serialize', 'deserialize'])
    expect(transport.requests[0].url).toBe('https://bucket.oss-cn-hangzhou.aliyuncs.com/dir/key.txt')
  })

  it('wraps a serialize failure in an OperationError and sends nothing', async () => {
    const transport = createMockTransport()
    const command = new EchoCommand({ bucket: 'bucket', key: 'k' })
    command.serialize = () => Promise.reject(new Error('cannot serialize'))

    const error = await new Client(config({ transport })).send(command).catch((err: unknown) => err)
    expect(error).toBeInstanceOf(OperationError)
    expect((error as OperationError).cause?.message).toBe('cannot serialize')
    expect(transport.requests).toHaveLength(0)
  })

  // `invokeOperation` is what reports a broken config, so `serialize` has already run by then. The
  // error arrives as itself rather than wrapped: `ParamRequiredError` is no `OperationError`.
  it('reports a broken config after serialize, having sent nothing', async () => {
    const transport = createMockTransport()
    const command = new EchoCommand({ bucket: 'bucket', key: 'k' })
    await expect(new Client({ transport }).send(command)).rejects.toBeInstanceOf(ParamRequiredError)
    expect(command.seen).toEqual(['serialize'])
    expect(transport.requests).toHaveLength(0)
  })
})

describe('isObjectExist', () => {
  it('uses GetObjectMeta and returns true for an existing object', async () => {
    const transport = createMockTransport()
    const client = new Client(config({ transport }))

    await expect(client.isObjectExist('bucket', 'dir/key.txt')).resolves.toBe(true)
    expect(transport.requests[0].method).toBe('HEAD')
    expect(transport.requests[0].url).toContain('/dir/key.txt?objectMeta')
  })

  it('returns false for a missing object or an unreadable 404 error response', async () => {
    const missing = new Client(
      config({
        transport: createMockTransport({ responses: [{ statusCode: 404, body: NOT_FOUND_BODY }] }),
      }),
    )
    await expect(missing.isObjectExist('bucket', 'missing')).resolves.toBe(false)

    const malformed = new Client(
      config({
        transport: createMockTransport({ responses: [{ statusCode: 404, body: '' }] }),
      }),
    )
    await expect(malformed.isObjectExist('bucket', 'missing')).resolves.toBe(false)
  })

  it('propagates failures other than a missing key', async () => {
    const transport = createMockTransport({
      responses: [
        {
          statusCode: 404,
          body: '<Error><Code>NoSuchBucket</Code><Message>missing</Message></Error>',
        },
      ],
    })
    const client = new Client(config({ transport }))

    await expect(client.isObjectExist('bucket', 'key')).rejects.toMatchObject({
      opName: 'GetObjectMeta',
      cause: { code: 'NoSuchBucket' },
    })
  })
})

describe('isBucketExist', () => {
  it('uses GetBucketAcl and returns true for an existing bucket', async () => {
    const transport = createMockTransport({
      responses: [{ body: '<AccessControlPolicy></AccessControlPolicy>' }],
    })
    const client = new Client(config({ transport }))

    await expect(client.isBucketExist('bucket')).resolves.toBe(true)
    expect(transport.requests[0].method).toBe('GET')
    expect(transport.requests[0].url).toContain('/?acl')
  })

  it('returns false for NoSuchBucket', async () => {
    const client = new Client(
      config({
        transport: createMockTransport({
          responses: [
            {
              statusCode: 404,
              body: '<Error><Code>NoSuchBucket</Code><Message>missing</Message></Error>',
            },
          ],
        }),
      }),
    )

    await expect(client.isBucketExist('bucket')).resolves.toBe(false)
  })

  it('reports a bucket as existing when the service denies access', async () => {
    const client = new Client(
      config({
        transport: createMockTransport({
          responses: [
            {
              statusCode: 403,
              body: '<Error><Code>AccessDenied</Code><Message>denied</Message></Error>',
            },
          ],
        }),
      }),
    )

    await expect(client.isBucketExist('bucket')).resolves.toBe(true)
  })

  it('propagates failures that have no service response', async () => {
    const failure = new CanceledError()
    const client = new Client(config({ transport: createMockTransport({ responses: [{ error: failure }] }) }))

    await expect(client.isBucketExist('bucket')).rejects.toMatchObject({
      opName: 'GetBucketAcl',
      cause: failure,
    })
  })
})

describe('presign', () => {
  const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000

  function query(url: string): URLSearchParams {
    return new URL(url).searchParams
  }

  function presign(overrides: Partial<OperationInput> = {}): PresignableInput {
    return new PresignableInput(getObject(overrides))
  }

  it('signs into the query and sends nothing', async () => {
    const transport = createMockTransport()
    const result = await new Client(config({ transport })).presign(presign())

    expect(result.method).toBe('GET')
    expect(result.url).toMatch(/^https:\/\/bucket\.oss-cn-hangzhou\.aliyuncs\.com\/dir\/key\.txt\?/)
    const params = query(result.url)
    expect(params.get('x-oss-signature-version')).toBe('OSS4-HMAC-SHA256')
    expect(params.get('x-oss-date')).toBe('20221228T102741Z')
    expect(params.get('x-oss-credential')).toBe('ak/20221228/cn-hangzhou/oss/aliyun_v4_request')
    expect(params.get('x-oss-signature')).toMatch(/^[0-9a-f]{64}$/)
    expect(transport.requests).toHaveLength(0)
  })

  it('keeps the operation parameters beside the signing ones', async () => {
    const result = await new Client(config()).presign(presign({ parameters: { versionId: '7' } }))
    expect(query(result.url).get('versionId')).toBe('7')
    expect(query(result.url).get('x-oss-signature')).not.toBeNull()
  })

  it('lasts fifteen minutes when the caller named no expiry', async () => {
    const result = await new Client(config()).presign(presign())
    expect(result.expiration?.getTime()).toBe(SIGN_TIME.getTime() + 15 * 60 * 1000)
    expect(query(result.url).get('x-oss-expires')).toBe('900')
  })

  // The span runs from the signing instant, so the URL lasts exactly as long as was asked.
  it('measures expiresInSeconds from the signing instant', async () => {
    const result = await new Client(config()).presign(presign(), { expiresInSeconds: 60 })
    expect(result.expiration?.getTime()).toBe(SIGN_TIME.getTime() + 60_000)
    expect(query(result.url).get('x-oss-expires')).toBe('60')
  })

  it('prefers expiration over expiresInSeconds', async () => {
    const expiration = new Date(SIGN_TIME.getTime() + 3_600_000)
    const result = await new Client(config()).presign(presign(), { expiration, expiresInSeconds: 60 })
    expect(result.expiration).toEqual(expiration)
    expect(query(result.url).get('x-oss-expires')).toBe('3600')
  })

  it('signs a v4 URL that lasts exactly seven days', async () => {
    const expiration = new Date(SIGN_TIME.getTime() + SEVEN_DAYS_MS)
    const result = await new Client(config()).presign(presign(), { expiration })
    expect(result.expiration).toEqual(expiration)
  })

  it('rejects a v4 URL asked to outlive seven days', async () => {
    const expiration = new Date(SIGN_TIME.getTime() + SEVEN_DAYS_MS + 1_000)
    await expect(new Client(config()).presign(presign(), { expiration })).rejects.toThrow(
      'invalid field, PresignOptions.expiration',
    )
  })

  // V1 carries no such limit, and signs the expiry as an absolute instant where V4 signs a span.
  it('signs a v1 URL of any lifetime', async () => {
    const expiration = new Date(SIGN_TIME.getTime() + SEVEN_DAYS_MS + 1_000)
    const result = await new Client(config({ signerVersion: 'v1' })).presign(presign(), { expiration })
    const params = query(result.url)
    expect(params.get('OSSAccessKeyId')).toBe('ak')
    expect(params.get('Expires')).toBe(String(Math.floor(expiration.getTime() / 1000)))
    expect(params.get('Signature')).not.toBeNull()
  })

  // The headers whoever replays the URL must reproduce: the ones OSS signs without being told to, plus
  // whatever `Config.additionalHeaders` asked for. The `User-Agent` the client sets is in neither set,
  // so a caller of the URL is not bound to send this SDK's.
  it('reports the headers the signature covered', async () => {
    const result = await new Client(config({ additionalHeaders: ['x-app-id'] })).presign(
      presign({
        method: 'PUT',
        headers: {
          'Content-Type': 'text/plain',
          'content-md5': '1B2M2Y8AsgTpgAmY7PhCfg==',
          'x-oss-meta-a': '1',
          'x-app-id': 'app',
          'If-Match': 'etag',
        },
      }),
    )
    expect(result.signedHeaders).toEqual({
      'Content-Type': 'text/plain',
      'content-md5': '1B2M2Y8AsgTpgAmY7PhCfg==',
      'x-oss-meta-a': '1',
      'x-app-id': 'app',
    })
  })

  it('reports no signed headers for a request that has none of its own', async () => {
    const result = await new Client(config()).presign(presign())
    expect(result.signedHeaders).toEqual({})
  })

  // Anonymity is the provider's class, as it is for a sent request. Nothing is signed, which leaves the
  // URL with no expiry to report either.
  it('signs nothing for an AnonymousCredentialsProvider', async () => {
    const result = await new Client(config({ credentialsProvider: new AnonymousCredentialsProvider() })).presign(
      presign(),
    )
    expect(result.url).toBe('https://bucket.oss-cn-hangzhou.aliyuncs.com/dir/key.txt')
    expect(result.expiration).toBeUndefined()
    expect(result.signedHeaders).toEqual({})
  })

  it('reports a missing credentials provider', async () => {
    await expect(new Client(config({ credentialsProvider: undefined })).presign(presign())).rejects.toBeInstanceOf(
      ParamRequiredError,
    )
  })

  it('reports a provider that failed, keeping its error as the cause', async () => {
    const failing: CredentialsProvider = { getCredentials: () => Promise.reject(new Error('no metadata service')) }
    const error = await new Client(config({ credentialsProvider: failing }))
      .presign(presign())
      .catch((err: unknown) => err)
    expect(error).toBeInstanceOf(CredentialsError)
    expect((error as CredentialsError).cause?.message).toBe('no metadata service')
  })

  it('reports credentials that carry no keys', async () => {
    const empty: CredentialsProvider = {
      getCredentials: () => Promise.resolve({ accessKeyId: 'ak', accessKeySecret: '' }),
    }
    await expect(new Client(config({ credentialsProvider: empty })).presign(presign())).rejects.toBeInstanceOf(
      CredentialsError,
    )
  })

  it('rejects an unusable envelope before signing anything', async () => {
    await expect(new Client(config()).presign(presign({ key: '' }))).rejects.toThrow('invalid field, key')
    await expect(new Client(config()).presign(presign({ bucket: 'Bad_Bucket' }))).rejects.toBeInstanceOf(
      ParamInvalidError,
    )
  })

  it('calls serializePresign and not serialize', async () => {
    const command = new EchoCommand({ bucket: 'bucket', key: 'dir/key.txt' })
    await new Client(config()).presign(command)
    expect(command.seen).toEqual(['serializePresign'])
  })

  it('wraps a serializePresign failure in an OperationError', async () => {
    const command = new EchoCommand({ bucket: 'bucket', key: 'k' })
    command.serializePresign = () => Promise.reject(new Error('cannot presign'))
    const error = await new Client(config()).presign(command).catch((err: unknown) => err)
    expect(error).toBeInstanceOf(OperationError)
    expect((error as OperationError).cause?.message).toBe('cannot presign')
  })

  it('signs at a clock offset an earlier request corrected', async () => {
    const transport: MockTransport = createMockTransport({
      responses: [
        { statusCode: 403, headers: { Date: 'Wed, 28 Dec 2022 11:27:41 GMT' }, body: SKEW_BODY },
        { statusCode: 200, body: '' },
      ],
    })
    const client = new Client(config({ transport }))
    await client.invokeOperation(getObject())

    const result = await client.presign(presign())
    expect(query(result.url).get('x-oss-date')).toBe('20221228T112741Z')
  })

  // A caller who pinned `x-oss-date` pinned the signing instant with it, the same way a sent request
  // does -- and that header is signed, so it comes back in `signedHeaders`.
  it('signs at a caller-supplied x-oss-date rather than the current time', async () => {
    const result = await new Client(config()).presign(
      presign({ headers: { 'x-oss-date': 'Sat, 31 Dec 2022 00:00:00 GMT' } }),
    )
    expect(query(result.url).get('x-oss-date')).toBe('20221231T000000Z')
    expect(result.expiration?.getTime()).toBe(Date.UTC(2022, 11, 31, 0, 15, 0))
  })
})

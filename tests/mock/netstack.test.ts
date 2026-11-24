import { describe, expect, it } from 'vitest'
import { Client } from '../../src/client.js'
import { StaticCredentialsProvider } from '../../src/credentials/static.js'
import { OperationError, OssError, RequestError, ServiceError } from '../../src/error/types.js'
import { FixedDelayBackoff } from '../../src/retry/backoff.js'
import { StandardRetryer } from '../../src/retry/standard.js'
import {
  createHarmonyTransport,
  type HarmonyHttpModule,
  type HarmonyRequestOptions,
  type HttpResponse,
} from '../../src/runtime/harmony/http.js'
import type { OperationInput, OperationOutput } from '../../src/types.js'

/** netstack codes the Harmony transport marks retryable. `2300028` is the transfer timeout. */
const RETRYABLE_NETSTACK_CODES = [
  2300005, 2300006, 2300007, 2300016, 2300018, 2300028, 2300035, 2300052, 2300055, 2300056, 2300080, 2300092,
]

interface Call {
  options: HarmonyRequestOptions
}

interface FakeHttp extends HarmonyHttpModule {
  calls: Call[]
}

function nativeError(code: number, message: string): Error {
  const error: Error & { code?: number } = new Error(message)
  error.code = code
  return error
}

function fakeHttp(reply: (call: Call) => Promise<HttpResponse>): FakeHttp {
  const fake: FakeHttp = {
    calls: [],
    HttpDataType: { ARRAY_BUFFER: 2 },
    createHttp() {
      return {
        request(_url: string, options: HarmonyRequestOptions): Promise<HttpResponse> {
          const call: Call = { options }
          fake.calls.push(call)
          return reply(call)
        },
        on(): void {},
        off(): void {},
        destroy(): void {},
      }
    },
  }
  return fake
}

function ok(): Promise<HttpResponse> {
  return Promise.resolve({ responseCode: 200, header: { 'x-oss-request-id': 'ok-1' }, result: '' })
}

/** First attempt fails, later attempts succeed. */
function failOnce(code: number): (call: Call) => Promise<HttpResponse> {
  let attempts = 0
  return () => {
    attempts += 1
    if (attempts === 1) return Promise.reject(nativeError(code, 'netstack failed ' + String(code)))
    return ok()
  }
}

function clientFor(http: HarmonyHttpModule, connectTimeoutMs?: number): Client {
  return new Client({
    region: 'cn-beijing',
    credentialsProvider: new StaticCredentialsProvider('ak', 'sk'),
    transport: createHarmonyTransport({ http, connectTimeoutMs }),
    retryer: new StandardRetryer({ maxAttempts: 3, backoff: new FixedDelayBackoff(0) }),
  })
}

const GET_OBJECT: OperationInput = {
  opName: 'GetObject',
  method: 'GET',
  bucket: 'czlbucket',
  key: 'sample/hello.txt',
}

function send(client: Client): Promise<OperationOutput> {
  return client.invokeOperation(GET_OBJECT)
}

describe('Harmony netstack mock', () => {
  it('passes connectTimeout through to @ohos.net.http', async () => {
    const http = fakeHttp(() => ok())
    const output = await send(clientFor(http, 2500))

    expect(output.statusCode).toBe(200)
    expect(http.calls[0].options.connectTimeout).toBe(2500)
    expect(http.calls[0].options.readTimeout).toBe(0)
  })

  it('retries a netstack timeout and then returns the later success', async () => {
    const http = fakeHttp(failOnce(2300028))
    const output = await send(clientFor(http))

    expect(output.statusCode).toBe(200)
    expect(http.calls.length).toBe(2)
  })

  it('retries every netstack code the transport treats as transient', async () => {
    for (const code of RETRYABLE_NETSTACK_CODES) {
      const http = fakeHttp(failOnce(code))
      const output = await send(clientFor(http))

      expect(output.statusCode).toBe(200)
      expect(http.calls.length).toBe(2)
    }
  })

  it('does not retry a netstack code outside the transient table', async () => {
    const native = nativeError(2300999, 'the device declined')
    const http = fakeHttp(() => Promise.reject(native))

    await expect(send(clientFor(http))).rejects.toSatisfy((error: Error) => {
      return error instanceof OperationError && error.cause === native
    })
    expect(http.calls.length).toBe(1)
  })

  it('reports the 100 MiB response limit and does not retry it', async () => {
    const http = fakeHttp(() => Promise.reject(nativeError(2300023, 'Failed to write the received data')))

    await expect(send(clientFor(http))).rejects.toSatisfy((error: Error) => {
      return (
        error instanceof OperationError &&
        error.cause instanceof OssError &&
        !(error.cause instanceof RequestError) &&
        error.cause.message.includes('104857600')
      )
    })
    expect(http.calls.length).toBe(1)
  })

  it('maps an OSS error body onto ServiceError and does not retry it', async () => {
    const body = [
      '<?xml version="1.0" encoding="UTF-8"?>',
      '<Error>',
      '  <Code>BucketAlreadyExists</Code>',
      '  <Message>The requested bucket name is not available.</Message>',
      '  <RequestId>req-409</RequestId>',
      '  <HostId>czlbucket.oss-cn-beijing.aliyuncs.com</HostId>',
      '  <EC>0001-00000001</EC>',
      '</Error>',
    ].join('\n')
    const http = fakeHttp(() => Promise.resolve({ responseCode: 409, header: {}, result: body }))

    await expect(send(clientFor(http))).rejects.toSatisfy((error: Error) => {
      if (!(error instanceof OperationError)) return false
      const service = error.contains((cause) => cause instanceof ServiceError)
      return (
        service instanceof ServiceError &&
        service.code === 'BucketAlreadyExists' &&
        service.requestId === 'req-409' &&
        service.statusCode === 409 &&
        service.ec === '0001-00000001'
      )
    })
    expect(http.calls.length).toBe(1)
  })
})

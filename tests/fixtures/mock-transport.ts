import { utf8Decode, utf8Encode } from '../../src/utils/bytes.js'
import type {
  RequestMessage,
  ResponseMessage,
  HttpTransport,
  ResponseBody,
  RequestOptions,
  StreamLike,
} from '../../src/transport/types.js'

export function bytesBody(data: Uint8Array): ResponseBody {
  return {
    bytes: () => Promise.resolve(data),
    text: () => Promise.resolve(utf8Decode(data)),
    stream: () => {
      let done = data.byteLength === 0
      return {
        read: () => {
          if (done) return Promise.resolve(null)
          done = true
          return Promise.resolve(data)
        },
      }
    },
  }
}

export function textBody(text: string): ResponseBody {
  return bytesBody(utf8Encode(text))
}

/** An empty body that counts reads. */
export class SpyBody implements ResponseBody {
  reads = 0

  bytes(): Promise<Uint8Array> {
    this.reads++
    return Promise.resolve(new Uint8Array(0))
  }

  text(): Promise<string> {
    this.reads++
    return Promise.resolve('')
  }

  stream(): StreamLike {
    this.reads++
    return { read: () => Promise.resolve(null) }
  }
}

export interface MockResponse {
  statusCode?: number
  status?: string
  headers?: Record<string, string>
  body?: string
  error?: Error
}

export interface MockTransportOptions {
  responses?: MockResponse[]
}

/** A transport that serves canned responses and records what it was asked to send. */
export interface MockTransport extends HttpTransport {
  /** Every request that reached the transport, in order, retaining object identity. */
  readonly requests: RequestMessage[]
  /** Recorded request options. */
  readonly sendOptions: RequestOptions[]
}

export function createMockTransport(options: MockTransportOptions = {}): MockTransport {
  const requests: RequestMessage[] = []
  const sendOptions: RequestOptions[] = []
  const queue = options.responses ?? [{ statusCode: 200, status: 'OK', headers: {} }]
  let at = 0

  return {
    requests,
    sendOptions,
    send: (request: RequestMessage, opts: RequestOptions): Promise<ResponseMessage> => {
      requests.push(request)
      sendOptions.push(opts)
      // Past the end, the last entry is served again indefinitely.
      const canned = queue[Math.min(at, queue.length - 1)]
      at += 1
      if (canned.error !== undefined) return Promise.reject(canned.error)
      return Promise.resolve({
        status: canned.status ?? '',
        statusCode: canned.statusCode ?? 200,
        headers: { ...(canned.headers ?? {}) },
        body: canned.body === undefined ? undefined : textBody(canned.body),
      })
    },
  }
}

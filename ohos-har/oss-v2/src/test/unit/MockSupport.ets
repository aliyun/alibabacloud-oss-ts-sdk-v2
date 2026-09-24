import { Client, StaticCredentialsProvider } from '../../../Index'
import type { HttpTransport, RequestMessage, RequestOptions, ResponseBody, ResponseMessage, StreamLike } from '../../../Index'

/** Content-MD5 of an empty body, the value `setDefaultContentMd5` falls back to. */
export const EMPTY_BODY_MD5: string = '1B2M2Y8AsgTpgAmY7PhCfg=='

export class CannedResponse {
  readonly statusCode: number
  readonly status: string
  readonly headers: Record<string, string>
  readonly body?: string

  constructor(statusCode: number, status: string, headers: Record<string, string>, body?: string) {
    this.statusCode = statusCode
    this.status = status
    this.headers = headers
    this.body = body
  }
}

export class SingleChunkStream implements StreamLike {
  private readonly chunk: Uint8Array
  private consumed: boolean = false

  constructor(chunk: Uint8Array) {
    this.chunk = chunk
  }

  read(): Promise<Uint8Array | null> {
    if (this.consumed) {
      return Promise.resolve(null)
    }
    this.consumed = true
    return Promise.resolve(this.chunk)
  }
}

export class TextResponseBody implements ResponseBody {
  private readonly value: string

  constructor(value: string) {
    this.value = value
  }

  bytes(): Promise<Uint8Array> {
    const bytes: number[] = []
    for (let index = 0; index < this.value.length; index += 1) {
      bytes.push(this.value.charCodeAt(index))
    }
    return Promise.resolve(new Uint8Array(bytes))
  }

  text(): Promise<string> {
    return Promise.resolve(this.value)
  }

  stream(): StreamLike {
    const bytes: number[] = []
    for (let index = 0; index < this.value.length; index += 1) {
      bytes.push(this.value.charCodeAt(index))
    }
    return new SingleChunkStream(new Uint8Array(bytes))
  }
}

export class ResponseMessageImpl implements ResponseMessage {
  readonly status: string
  readonly statusCode: number
  readonly headers: Record<string, string>
  readonly body?: ResponseBody

  constructor(response: CannedResponse) {
    this.status = response.status
    this.statusCode = response.statusCode
    this.headers = response.headers
    this.body = response.body === undefined ? undefined : new TextResponseBody(response.body)
  }
}

export class MockTransport implements HttpTransport {
  readonly requests: RequestMessage[] = []
  readonly sendOptions: RequestOptions[] = []
  private readonly responses: CannedResponse[]
  private responseIndex: number = 0

  constructor(responses: CannedResponse[]) {
    this.responses = responses
  }

  send(request: RequestMessage, options: RequestOptions): Promise<ResponseMessage> {
    this.requests.push(request)
    this.sendOptions.push(options)
    const response = this.responses[Math.min(this.responseIndex, this.responses.length - 1)]
    this.responseIndex += 1
    return Promise.resolve(new ResponseMessageImpl(response))
  }
}

/** A transport whose every send fails with the same error. */
export class FailingTransport implements HttpTransport {
  readonly requests: RequestMessage[] = []
  private readonly failure: Error

  constructor(failure: Error) {
    this.failure = failure
  }

  send(request: RequestMessage, options: RequestOptions): Promise<ResponseMessage> {
    this.requests.push(request)
    return Promise.reject(this.failure)
  }
}

/** A client whose requests all travel through `transport`. */
export function createClient(transport: HttpTransport): Client {
  return new Client({
    region: 'cn-hangzhou',
    credentialsProvider: new StaticCredentialsProvider('ak', 'sk'),
    transport
  })
}

/** Reads a request body as text; string and byte bodies are replayable, so reads can repeat. */
export async function readBodyText(request: RequestMessage): Promise<string> {
  const body = request.body
  if (body === undefined) {
    return ''
  }
  const reader = body.source()
  let text = ''
  let chunk: Uint8Array | null = await reader.read()
  while (chunk !== null) {
    for (let index = 0; index < chunk.length; index += 1) {
      text += String.fromCharCode(chunk[index])
    }
    chunk = await reader.read()
  }
  return text
}

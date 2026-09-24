import { CanceledError, RequestError, SerializationError } from '../../error/types.js'
import type {
  RequestMessage,
  ResponseMessage,
  HttpTransport,
  HttpTransportOptions,
  ByteContent,
  ResponseBody,
  RequestOptions,
  StreamLike,
} from '../../transport/types.js'
import { allowsStreaming, bufferedBody } from '../../transport/buffered-body.js'
import { BytesContent, StringContent } from '../../transport/content.js'
import { BlobContent } from './content.js'
import { fromReadableStream } from './stream.js'
import { utf8Decode } from '../../utils/bytes.js'

function bufferSource(data: Uint8Array): Uint8Array<ArrayBuffer> {
  return data as Uint8Array<ArrayBuffer>
}

/** Converts supported `ByteContent` implementations to a `fetch` body. */
function fetchBody(body: ByteContent | undefined): BodyInit | undefined {
  if (body === undefined) return undefined
  if (body instanceof BlobContent) return body.blob
  if (body instanceof StringContent) return bufferSource(body.bytes)
  if (body instanceof BytesContent) return bufferSource(body.bytes)
  throw new SerializationError(
    'a browser cannot stream this request body; wrap a File or Blob with blobBody(), or read it into a Uint8Array first (e.g. new Uint8Array(await file.arrayBuffer()))',
  )
}

/** Wraps a fetch response body and translates cancellation failures. */
function fetchResponseBody(response: Response, reason: () => Error | undefined, release: () => void): ResponseBody {
  const translate = (error: Error): never => {
    release()
    throw reason() ?? error
  }

  let buffered: Promise<Uint8Array> | undefined
  const bytes = (): Promise<Uint8Array> => {
    if (buffered === undefined) {
      buffered = response.arrayBuffer().then((buffer) => {
        release()
        return new Uint8Array(buffer)
      }, translate)
    }
    return buffered
  }

  return {
    bytes,
    text: async (): Promise<string> => utf8Decode(await bytes()),
    stream: (): StreamLike => {
      const source = fromReadableStream(response.body)
      return {
        read: async (): Promise<Uint8Array | null> => {
          const chunk = await source.read().catch(translate)
          if (chunk === null) release()
          return chunk
        },
      }
    },
  }
}

function toRecord(headers: Headers): Record<string, string> {
  const out: Record<string, string> = {}
  // `Headers` has already lowercased the names and joined repeats with ', '.
  headers.forEach((value, name) => {
    out[name] = value
  })
  return out
}

/**
 * The `fetch` transport.
 *
 * ```ts
 * const client = new Client({ region: 'cn-hangzhou', credentialsProvider, transport: createBrowserTransport() })
 * ```
 *
 * Platform limits:
 *
 * 1. **`signerVersion: 'v1'` fails** -- `fetch` drops the signed `Date` header; use v4.
 * 2. **`Config.userAgent` never reaches the network** and no `platform` is reported: a forbidden header.
 * 3. **A request body must fit in memory,** and both `HttpTransportOptions` deadlines are ignored.
 * 4. **`proxyHost` is ignored:** `fetch` routes through whatever proxy the browser or OS is set to and
 *    gives script no way to choose one.
 * 5. **`insecureSkipVerify` is ignored:** `fetch` gives script no control over certificate verification.
 * 6. **`enabledRedirect` is ignored:** `fetch` follows redirects by its own default and cannot be told
 *    otherwise from script.
 */
export function createBrowserTransport(_options?: HttpTransportOptions): HttpTransport {
  return {
    canStreamUpload: false,
    async send(request: RequestMessage, options: RequestOptions): Promise<ResponseMessage> {
      const signal = options.signal
      if (signal !== undefined && signal.aborted) throw new CanceledError()

      const body = fetchBody(request.body)
      const controller = new AbortController()

      // Records caller cancellation for error translation.
      let failure: Error | undefined
      const onAbort = (): void => {
        failure = new CanceledError()
        controller.abort()
      }
      if (signal !== undefined) signal.addEventListener('abort', onAbort)
      const release = (): void => {
        if (signal !== undefined) signal.removeEventListener('abort', onAbort)
      }

      try {
        const response = await fetch(request.url, {
          method: request.method,
          headers: request.headers.toRecord(),
          body,
          signal: controller.signal,
        })
        // Only a 2xx other than 203 streams when asked; every other body is read before send
        // resolves, inside this try.
        if (allowsStreaming(options.responseStream, response.status)) {
          // The body wrapper releases the abort listener when the body settles.
          return {
            status: response.statusText,
            statusCode: response.status,
            headers: toRecord(response.headers),
            body: fetchResponseBody(response, () => failure, release),
          }
        }
        const bytes = new Uint8Array(await response.arrayBuffer())
        release()
        return {
          status: response.statusText,
          statusCode: response.status,
          headers: toRecord(response.headers),
          body: bufferedBody(bytes),
        }
      } catch (error) {
        release()
        if (failure !== undefined) throw failure
        // Fetch reports network failures as `TypeError`.
        if (error instanceof TypeError) throw new RequestError(error.message, error)
        throw error
      }
    },
  }
}

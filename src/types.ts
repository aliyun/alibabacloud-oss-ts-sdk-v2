import type { CredentialsProvider } from './credentials/types.js'
import type { Logger } from './log/logger.js'
import type { Retryer } from './retry/types.js'
import type { Signer } from './signer/types.js'
import type { HeaderFields, HttpTransport, RequestBody, ResponseBody } from './transport/types.js'
import type { AbortSignalLike } from './utils/abort.js'

/** How the bucket is addressed. Any value that is not one of these is addressed as `VIRTUAL_HOSTED`. */
export enum UrlStyleType {
  VIRTUAL_HOSTED = 0,
  PATH = 1,
  CNAME = 2,
}

/** Bitmask values for SDK features a client may enable. */
export enum FeatureFlagsType {
  AUTO_DETECT_MIME_TYPE = 1 << 0,
}

/**
 * `Config` with every default already chosen: what the client actually uses. Raw knobs do not
 * survive here -- `retryMaxAttempts` becomes the `retryer`, `signerVersion` becomes the `signer` --
 * and the platform contract does not appear at all.
 */
export interface ClientOptions {
  /** Signed as the service name. */
  product: string
  region: string
  /** As given, or derived from `region`. Carries a scheme, http when `Config.disableSsl` is set. */
  endpoint: string
  /** No default exists: a client without one cannot sign. */
  credentialsProvider?: CredentialsProvider
  signer: Signer
  retryer: Retryer
  /** The platform default when `Config` carries none; may be absent after a `ClientOptionsFn`. */
  transport?: HttpTransport
  urlStyle: UrlStyleType
  /** Bitmask of enabled SDK features. */
  featureFlags: number
  additionalHeaders?: string[]
  logger?: Logger
}

/** Changes the resolved options before the client builds from them. */
export type ClientOptionsFn = (options: ClientOptions) => void

/** Called as the request body is sent, with the bytes since the last call. */
export type ProgressHandler = (increment: number, transferred: number, total: number) => void

/** Called with the response status and headers before the body is read. */
export type ResponseHandler = (statusCode: number, headers: Record<string, string>) => void

/**
 * A plain-data value on the `opMetadata` side channel. The V1 signer reads its sub-resources from
 * here; callbacks travel on `OperationInnerOptions`.
 */
export type OperationMetadataValue = boolean | number | string | string[]

/** An API call as the client takes it, one level above HTTP. */
export interface OperationInput {
  opName: string
  method: string
  /** A serializer's `HeaderFields`, or a plain record `buildRequest` copies into one. */
  headers?: Record<string, string> | HeaderFields
  parameters?: Record<string, string>
  body?: RequestBody
  bucket?: string
  key?: string
  opMetadata?: Record<string, OperationMetadataValue>
}

/** The response to an `OperationInput`, carrying the input that produced it. */
export interface OperationOutput {
  input: OperationInput
  status: string
  statusCode: number
  headers: Record<string, string>
  body?: ResponseBody
  opMetadata?: Record<string, OperationMetadataValue>
}

/** Per-request transport overrides. `signal` applies to the whole call across retries. */
export interface OperationOptions {
  retryMaxAttempts?: number
  readWriteTimeoutMs?: number
  signal?: AbortSignalLike
}

/** Callbacks carried beside the serialized input and not sent on the wire. */
export interface OperationInnerOptions {
  progressHandler?: ProgressHandler
  responseHandlers?: ResponseHandler[]
}

/** One API call, reified. `Client.send` is `serialize` -> `invokeOperation` -> `deserialize`. */
export interface Command<I, O> {
  /** The name of the operation, as it appears in an `OperationError`. */
  readonly opName: string
  /** The request this command was constructed with. */
  readonly input: I
  /** @internal Called by `Client.send`. Not a supported extension point. */
  serialize(input: I): Promise<OperationInput>
  /** @internal Called by `Client.send`. See `serialize`. */
  deserialize(output: OperationOutput): Promise<O>
  /** @internal Called by `Client.send` to serialize request callbacks. */
  serializeInner?(input: I): OperationInnerOptions
}

/**
 * A command `Client.presign` accepts. Requests requiring a body or an SDK-computed header cannot be
 * presigned.
 */
export interface Presignable<I, O> extends Command<I, O> {
  /**
   * @internal Called by `Client.presign`. Omits values the SDK would add automatically. Signed headers
   * must be reproduced exactly when the URL is used.
   */
  serializePresign(input: I): Promise<OperationInput>
}

/**
 * How long a presigned URL lasts. Both absent means fifteen minutes, and a V4 signature may not be
 * asked to live longer than seven days.
 */
export interface PresignOptions {
  /** The instant it stops working. Wins over `expiresInSeconds`. */
  expiration?: Date
  /** Its lifetime from now, in seconds. */
  expiresInSeconds?: number
}

export interface PresignResult {
  /** The method the URL was signed for. Sending another one fails the signature. */
  method: string
  url: string
  /** Absent when the client signs nothing, which leaves the URL with no expiry either. */
  expiration?: Date
  /**
   * The headers that were signed, and that a caller of the URL must therefore send unchanged. Empty
   * for the common case of a URL that needs none.
   */
  signedHeaders: Record<string, string>
}

/** Tunes a paginator. */
export interface PaginatorOptions {
  /** The most items one page may hold, overriding the request's own `maxKeys`/`maxParts`/`maxUploads`. */
  limit?: number
}

/** The client capability a paginator requires. */
export interface PaginatorClient {
  send<I, O>(command: Command<I, O>, options?: OperationOptions): Promise<O>
}

/**
 * A list operation reified as pages. `Client.paginate` drives it; `pages` walks the continuation
 * cursor by sending the underlying command through `client.send`, so signing, retry and encoding are
 * whatever a direct call would get. Construct one from `src/paginator`, e.g. `ListObjectsV2Paginator`.
 */
export interface Paginator<O> {
  /** @internal Called by `Client.paginate`. Yields each page until the result stops being truncated. */
  pages(client: PaginatorClient, options?: OperationOptions): AsyncGenerator<O>
}

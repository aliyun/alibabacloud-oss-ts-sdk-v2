// Client and configuration
export { Client } from './client.js'
export type { Config } from './config.js'

// The resolved configuration, for a `ClientOptionsFn` passed to `new Client`
export { FeatureFlagsType, UrlStyleType } from './types.js'
export type { ClientOptions, ClientOptionsFn } from './types.js'

// The operation envelope, for `client.invokeOperation`
export type {
  Command,
  Presignable,
  PresignOptions,
  PresignResult,
  Paginator,
  PaginatorOptions,
  OperationOptions,
  OperationInput,
  OperationOutput,
  OperationMetadataValue,
  ProgressHandler,
  ResponseHandler,
} from './types.js'

// Platform contract, for callers supplying their own transport
export type {
  HeaderFields,
  HttpTransport,
  RequestMessage,
  ResponseMessage,
  RequestOptions,
  RequestBody,
  ResponseBody,
  StreamLike,
  ByteContent,
  ByteSource,
} from './transport/types.js'
// Request-body descriptors and their factories, for building a body explicitly.
export { BytesContent, StringContent, StreamContent, bytesBody, stringBody, streamBody } from './transport/content.js'
export type { AbortSignalLike } from './utils/abort.js'
export { addMimeType, lookupMimeType } from './utils/mime-type.js'
export type { MimeTypeMappings } from './utils/mime-type.js'
export type { Logger } from './log/logger.js'

// Errors
export {
  OssError,
  ServiceError,
  OperationError,
  ParamRequiredError,
  ParamInvalidError,
  SerializationError,
  DeserializationError,
  CredentialsError,
  RequestError,
  CanceledError,
  NotSupportedError,
} from './error/types.js'
export type { ServiceErrorFields } from './error/types.js'

// Credentials.
export * from './credentials/index.js'

// Signing.
export * from './signer/index.js'

// Retry.
export * from './retry/index.js'

// Models, as the `oss.models.*` namespace, isolating type names that collide across categories.
export type * as models from './models/index.js'

// Commands, flat on the top-level surface.
export * from './api/index.js'

// Paginators, flat alongside the commands they wrap.
export * from './paginator/index.js'

/** How far anything in this SDK follows a `cause` chain. A foreign error can be cyclic. */
export const MAX_CAUSE_DEPTH = 8

/** The base class of every error this SDK throws. */
export class OssError extends Error {
  /** The error that caused this one, if any. */
  readonly cause?: Error

  constructor(message: string, cause?: Error) {
    super(message)
    this.name = 'OssError'
    this.cause = cause
  }
}

/** The parsed parts of an error response, as `ServiceError` needs them. */
export interface ServiceErrorFields {
  statusCode: number
  code: string
  message: string
  requestId: string
  ec: string
  headers: Record<string, string>
  hostId?: string
  timestamp?: Date
  requestTarget?: string
  snapshot?: string
}

/** An error the service returned, as opposed to one raised locally. */
export class ServiceError extends OssError {
  /** The HTTP status code of the response. */
  readonly statusCode: number
  /** The error code the service returned. */
  readonly code: string
  /** The service's own error message, without the surrounding text `message` adds. */
  readonly errorMessage: string
  /** The request id of the response, for a support ticket. */
  readonly requestId: string
  /** The error code extension, which locates the failure more precisely than `code`. */
  readonly ec: string
  /** The host that the service reported as handling the request. */
  readonly hostId?: string
  /** The response headers, as the transport reported them. */
  readonly headers: Record<string, string>
  /** The server's clock, from the response `Date` header. Drives clock-skew correction. */
  readonly timestamp?: Date
  /** The method and URL of the request that failed. */
  readonly requestTarget?: string
  /** The error body as decoded text, so a failure whose `code` did not parse is still diagnosable. */
  readonly snapshot?: string

  constructor(fields: ServiceErrorFields) {
    super(
      'Error returned by Service. \nHttp Status Code: ' +
        String(fields.statusCode) +
        '. \nError Code: ' +
        fields.code +
        '. \nRequest Id: ' +
        fields.requestId +
        '. \nMessage: ' +
        fields.message +
        '.\nEC: ' +
        fields.ec +
        '.\nTimestamp: ' +
        (fields.timestamp === undefined ? '' : fields.timestamp.toISOString()) +
        '.\nRequest Endpoint: ' +
        (fields.requestTarget === undefined ? '' : fields.requestTarget) +
        '.',
    )
    this.name = 'ServiceError'
    this.statusCode = fields.statusCode
    this.code = fields.code
    this.errorMessage = fields.message
    this.requestId = fields.requestId
    this.ec = fields.ec
    this.hostId = fields.hostId
    this.headers = fields.headers
    this.timestamp = fields.timestamp
    this.requestTarget = fields.requestTarget
    this.snapshot = fields.snapshot
  }
}

/** The wrapper every failure of an operation arrives in, naming the operation that failed. */
export class OperationError extends OssError {
  /** The name of the operation, such as `PutObject`. */
  readonly opName: string

  constructor(opName: string, cause: Error) {
    super('operation error ' + opName + ': ' + cause.message, cause)
    this.name = 'OperationError'
    this.opName = opName
  }

  /**
   * Walks the `cause` chain and returns the first error `match` accepts, so a caller can reach the
   * `ServiceError` under the wrapper:
   *
   *     const service = err.contains((e) => e instanceof ServiceError)
   *     if (service instanceof ServiceError) { ... }
   *
   * The returned error is typed `Error`, so the narrowing test has to be repeated at the call site.
   */
  contains(match: (error: Error) => boolean): Error | undefined {
    const seen: Error[] = []
    let next = this.cause
    while (next !== undefined && seen.length < MAX_CAUSE_DEPTH) {
      if (match(next)) {
        return next
      }
      if (seen.indexOf(next) >= 0) break
      seen.push(next)
      // The walk reaches only `OssError.cause`, so a chain ends at the first foreign error.
      const parent: Error | undefined = next instanceof OssError ? next.cause : undefined
      next = parent instanceof Error ? parent : undefined
    }
    return undefined
  }
}

/** A required field of the request was not set. */
export class ParamRequiredError extends OssError {
  /** The name of the field. */
  readonly field: string

  constructor(field: string) {
    super('missing required field, ' + field)
    this.name = 'ParamRequiredError'
    this.field = field
  }
}

/** A field of the request was set to a value the SDK rejects before sending. */
export class ParamInvalidError extends OssError {
  /** The name of the field. */
  readonly field: string

  constructor(field: string) {
    super('invalid field, ' + field)
    this.name = 'ParamInvalidError'
    this.field = field
  }
}

/** The request could not be built. */
export class SerializationError extends OssError {
  constructor(message: string, cause?: Error) {
    super(message, cause)
    this.name = 'SerializationError'
  }
}

/** The response arrived but could not be read into a result. */
export class DeserializationError extends OssError {
  constructor(message: string, cause?: Error) {
    super(message, cause)
    this.name = 'DeserializationError'
  }
}

/** The credentials provider failed, or returned credentials with no key. */
export class CredentialsError extends OssError {
  constructor(message: string, cause?: Error) {
    super(message, cause)
    this.name = 'CredentialsError'
  }
}

/**
 * The request never produced a response. The retryer retries this by type, so a transport must report
 * a failure worth another attempt as one; anything else it throws goes back untouched and is not
 * retried.
 */
export class RequestError extends OssError {
  constructor(message: string, cause?: Error) {
    super(message, cause)
    this.name = 'RequestError'
  }
}

/** The caller's `AbortSignal` fired. Never retried. */
export class CanceledError extends OssError {
  constructor() {
    super('the operation was canceled')
    this.name = 'CanceledError'
  }
}

/** The current runtime cannot provide the requested SDK capability. */
export class NotSupportedError extends OssError {
  constructor(capability: string) {
    super(capability + ' is not supported on this runtime')
    this.name = 'NotSupportedError'
  }
}

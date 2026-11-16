import type { Config } from '../config.js'
import { AnonymousCredentialsProvider } from '../credentials/anonymous.js'
import { hasKeys } from '../credentials/types.js'
import type { Credentials } from '../credentials/types.js'
import { CredentialsError, OperationError, OssError, ParamInvalidError, ParamRequiredError } from '../error/types.js'
import type { Logger } from '../log/logger.js'
import { ResponseCheckerMiddleware } from './checker-middleware.js'
import type { ExecuteContext } from './execute-context.js'
import { ExecuteStack } from './execute-stack.js'
import { ProgressObserver, resolveUploadTotal } from './progress.js'
import { RetryerMiddleware } from './retryer-middleware.js'
import { SignerMiddleware } from './signer-middleware.js'
import { missingTransport, TransportMiddleware } from './transport-middleware.js'
import { StandardRetryer } from '../retry/standard.js'
import type { Retryer } from '../retry/types.js'
import { createDefaultTransport } from '../runtime/default-transport.js'
import { isDefaultSignedHeader } from '../signer/types.js'
import type { Signer, SigningContext } from '../signer/types.js'
import { SignerV1 } from '../signer/v1.js'
import { SignerV4 } from '../signer/v4.js'
import type { RequestMessage, HttpTransport } from '../transport/types.js'
import { toByteContent } from '../transport/content.js'
import { FeatureFlagsType, UrlStyleType } from '../types.js'
import type {
  ClientOptions,
  ClientOptionsFn,
  OperationInput,
  OperationMetadataValue,
  OperationOutput,
  OperationOptions,
  OperationInnerOptions,
  PresignOptions,
  PresignResult,
} from '../types.js'
import { endpointFromRegion, parseEndpoint } from '../utils/endpoint.js'
import type { EndpointType, ParsedEndpoint } from '../utils/endpoint.js'
import { createHeaderFields, isHeaderFields } from '../utils/header-fields.js'
import { lookupMimeType } from '../utils/mime-type.js'
import { parseHttpTime } from '../utils/time.js'
import { buildQueryString, escapePath } from '../utils/uri.js'
import { buildUserAgent } from '../utils/user-agent.js'
import { isIpAddress, isValidBucketName, isValidObjectName, isValidRegion } from '../utils/validation.js'

const DEFAULT_PRODUCT = 'oss'
const DEFAULT_FEATURE_FLAGS = FeatureFlagsType.AUTO_DETECT_MIME_TYPE
const DETECT_CONTENT_TYPE = 'detect_content_type'
const RESPONSE_STREAM = 'response-stream'
const DEFAULT_CONTENT_TYPE = 'application/octet-stream'

/** Both values bound a transport phase. */
const DEFAULT_CONNECT_TIMEOUT_MS = 5_000
const DEFAULT_READ_WRITE_TIMEOUT_MS = 20_000

function schemeOf(config: Config): string {
  return config.disableSsl === true ? 'http' : 'https'
}

/** First match wins, in this order. */
function endpointTypeOf(config: Config): EndpointType {
  if (config.useInternalEndpoint === true) return 'internal'
  if (config.useDualStackEndpoint === true) return 'dualstack'
  if (config.useAccelerateEndpoint === true) return 'accelerate'
  return 'public'
}

/** Returns empty when no host can be resolved. */
function resolveEndpoint(config: Config): string {
  const endpoint = config.endpoint?.trim() ?? ''
  if (endpoint.length > 0) return endpoint
  const region = config.region ?? ''
  if (!isValidRegion(region)) return ''
  return endpointFromRegion(region, endpointTypeOf(config), schemeOf(config))
}

function resolveSigner(config: Config): Signer {
  if (config.signer !== undefined) return config.signer
  return config.signerVersion === 'v1' ? new SignerV1() : new SignerV4()
}

function resolveRetryer(config: Config): Retryer {
  return config.retryer ?? new StandardRetryer({ maxAttempts: config.retryMaxAttempts })
}

/** Builds the platform default transport when `Config.transport` is absent. */
function resolveHttpTransport(config: Config): HttpTransport {
  if (config.transport !== undefined) return config.transport
  return createDefaultTransport({
    connectTimeoutMs: config.connectTimeoutMs ?? DEFAULT_CONNECT_TIMEOUT_MS,
    readWriteTimeoutMs: config.readWriteTimeoutMs ?? DEFAULT_READ_WRITE_TIMEOUT_MS,
    proxyHost: config.proxyHost,
    insecureSkipVerify: config.insecureSkipVerify,
    enabledRedirect: config.enabledRedirect,
  })
}

/** Resolves addressing style from flags; IP endpoints are handled in `resolveInnerOptions`. */
function resolveUrlStyle(config: Config): UrlStyleType {
  if (config.useCname === true) return UrlStyleType.CNAME
  if (config.usePathStyle === true) return UrlStyleType.PATH
  return UrlStyleType.VIRTUAL_HOSTED
}

/** Defaults enable every feature; a Config disable switch clears only its corresponding bit. */
function resolveFeatureFlags(config: Config): number {
  let flags = DEFAULT_FEATURE_FLAGS
  if (config.disableAutoDetectMimeType === true) flags &= ~FeatureFlagsType.AUTO_DETECT_MIME_TYPE
  return flags
}

/**
 * Coerces an operation-metadata flag into a strict boolean.
 * - Missing -> undefined
 * - boolean -> the value itself
 * - string `'true'` -> true
 * - anything else -> undefined
 */
function toBoolean(value: OperationMetadataValue | undefined): boolean | undefined {
  if (value === undefined) return undefined
  if (typeof value === 'boolean') return value
  if (value === 'true') return true
  return undefined
}

/** Resolves `Config` into `ClientOptions` without validation. */
function resolveClientOptions(config: Config): ClientOptions {
  return {
    product: DEFAULT_PRODUCT,
    region: config.region ?? '',
    endpoint: resolveEndpoint(config),
    credentialsProvider: config.credentialsProvider,
    signer: resolveSigner(config),
    retryer: resolveRetryer(config),
    transport: resolveHttpTransport(config),
    urlStyle: resolveUrlStyle(config),
    featureFlags: resolveFeatureFlags(config),
    additionalHeaders: config.additionalHeaders,
    logger: config.logger,
  }
}

/** What the client derives from the resolved options, and what it learns while running. */
interface InnerOptions {
  userAgent: string
  /** Absent when `ClientOptions.endpoint` is empty or unusable; `verifyOperation` reports which. */
  endpoint?: ParsedEndpoint
  /** `ClientOptions.urlStyle` with the IP-endpoint override applied. */
  urlStyle: UrlStyleType
  /** Learned from a RequestTimeTooSkewed correction and reused by later requests. */
  clockOffset: number
  stack: ExecuteStack
}

/** Builds per-client state from resolved options. */
function resolveInnerOptions(config: Config, options: ClientOptions): InnerOptions {
  const logger = options.logger
  /* The default chain, outermost first: `Retryer`, `Signer`, `ResponseChecker`, then transport. */
  const transport = options.transport ?? missingTransport
  const stack = new ExecuteStack(() => new TransportMiddleware(transport))
  stack.push((next) => new RetryerMiddleware(next, options.retryer, logger), 'Retryer')
  stack.push((next) => new SignerMiddleware(next, options.signer, options.credentialsProvider, logger), 'Signer')
  stack.push((next) => new ResponseCheckerMiddleware(next, logger), 'ResponseChecker')
  stack.apply()

  const endpoint = parseEndpoint(options.endpoint, schemeOf(config))
  // IP endpoints use path-style addressing.
  const ip = endpoint !== undefined && isIpAddress(endpoint.hostname)

  return {
    userAgent: buildUserAgent(options.transport?.platform, config.userAgent),
    endpoint,
    urlStyle: ip ? UrlStyleType.PATH : options.urlStyle,
    clockOffset: 0,
    stack,
  }
}

/** Builds the host and path without a scheme or query. */
function buildHostPath(input: OperationInput, endpointHost: string, urlStyle: UrlStyleType): string {
  let host = endpointHost
  const paths: string[] = []

  if (input.bucket !== undefined) {
    switch (urlStyle) {
      case UrlStyleType.PATH:
        paths.push(input.bucket)
        // A bucket operation must end in a slash, or OSS reads the bucket as an object key.
        if (input.key === undefined) paths.push('')
        break
      case UrlStyleType.CNAME:
        // The custom domain is already bound to the bucket, so the bucket appears nowhere.
        break
      default:
        // `VIRTUAL_HOSTED`, and any value that is not a `UrlStyleType` at all.
        host = input.bucket + '.' + endpointHost
        break
    }
  }

  if (input.key !== undefined) paths.push(escapePath(input.key, false))

  return host + '/' + paths.join('/')
}

/** The longest a V4 signature may live. V1 carries no such limit. */
const MAX_V4_EXPIRATION_MS = 7 * 24 * 60 * 60 * 1000

/**
 * `expiration` takes precedence over `expiresInSeconds`, which is measured from the signing instant.
 * When both are absent, the signer applies its default.
 */
function resolveExpiration(signTime: Date, options?: PresignOptions): Date | undefined {
  if (options?.expiration !== undefined) return options.expiration
  const seconds = options?.expiresInSeconds
  if (seconds === undefined) return undefined
  return new Date(signTime.getTime() + seconds * 1000)
}

/** The headers covered by the signature and required unchanged when the URL is used. */
function signedHeadersOf(headers: Record<string, string>, additionalHeadersToSign: string): Record<string, string> {
  const additional = additionalHeadersToSign.length > 0 ? additionalHeadersToSign.split(';') : []
  const signed: Record<string, string> = {}
  for (const name of Object.keys(headers)) {
    const lower = name.toLowerCase()
    if (isDefaultSignedHeader(lower) || additional.indexOf(lower) >= 0) signed[name] = headers[name] ?? ''
  }
  return signed
}

/**
 * Resolves the config, holds the chain, and turns one `OperationInput` into one `OperationOutput`. It
 * knows nothing of operations or their models: serializing one is `Client`'s.
 */
export class ClientImpl {
  readonly options: ClientOptions
  readonly innerOptions: InnerOptions

  /** Resolves options, applies `ClientOptionsFn` entries in order, and builds without validation. */
  constructor(config: Config, fns: readonly ClientOptionsFn[]) {
    const options = resolveClientOptions(config)
    for (const fn of fns) fn(options)
    this.options = options
    this.innerOptions = resolveInnerOptions(config, options)
  }

  /** Sends one envelope through the middleware chain. The only per-request entry point there is. */
  async invokeOperation(
    input: OperationInput,
    options?: OperationOptions,
    innerOptions?: OperationInnerOptions,
  ): Promise<OperationOutput> {
    const endpoint = this.verifyOperation(input)
    const logger = this.options.logger
    const request = this.buildRequest(input, endpoint)
    const context = this.buildContext(input, request, options, innerOptions)

    logger?.debug('invokeOperation ' + input.opName + ' ' + request.method + ' ' + request.url)

    try {
      const response = await this.innerOptions.stack.execute(request, context)
      return {
        input,
        status: response.status,
        statusCode: response.statusCode,
        headers: response.headers,
        body: response.body,
        opMetadata: input.opMetadata,
      }
    } catch (err) {
      throw new OperationError(
        input.opName,
        err instanceof Error ? err : new OssError('the middleware chain threw a value that was not an Error'),
      )
    } finally {
      this.captureClockOffset(context, logger)
    }
  }

  /** Signs one envelope into a URL and returns without sending it. */
  async presignOperation(input: OperationInput, options?: PresignOptions): Promise<PresignResult> {
    const endpoint = this.verifyOperation(input)
    const request = this.buildRequest(input, endpoint)
    const context = this.buildContext(input, request)
    const signingContext = context.signingContext
    signingContext.authHeader = false

    const signTime = signingContext.signTime ?? new Date(Date.now() + this.innerOptions.clockOffset)
    signingContext.signTime = signTime
    signingContext.expirationTime = resolveExpiration(signTime, options)

    // An anonymous client returns an unsigned URL with no expiry.
    const provider = this.options.credentialsProvider
    if (provider === undefined) throw new ParamRequiredError('Config.credentialsProvider')
    if (provider instanceof AnonymousCredentialsProvider) {
      return { method: request.method, url: request.url, signedHeaders: {} }
    }

    let credentials: Credentials
    try {
      credentials = await provider.getCredentials()
    } catch (err) {
      throw new CredentialsError(
        'failed to fetch credentials from the provider',
        err instanceof Error ? err : new OssError('the credentials provider threw a value that was not an Error'),
      )
    }
    if (!hasKeys(credentials)) {
      throw new CredentialsError('the credentials provider returned credentials with no access key id or secret')
    }
    signingContext.credentials = credentials
    await this.options.signer.sign(request, signingContext)

    const expiration = signingContext.expirationTime
    if (
      this.options.signer instanceof SignerV4 &&
      expiration !== undefined &&
      expiration.getTime() - signTime.getTime() > MAX_V4_EXPIRATION_MS
    ) {
      throw new ParamInvalidError('PresignOptions.expiration')
    }

    return {
      method: request.method,
      url: request.url,
      expiration,
      signedHeaders: signedHeadersOf(request.headers.toRecord(), signingContext.additionalHeadersToSign),
    }
  }

  /** Validates client options and operation input on every call and returns the parsed endpoint. */
  private verifyOperation(input: OperationInput): ParsedEndpoint {
    if (this.options.endpoint.length === 0) throw new ParamRequiredError('Config.endpoint or Config.region')
    const endpoint = this.innerOptions.endpoint
    if (endpoint === undefined) throw new ParamInvalidError('Config.endpoint')
    if (input.bucket !== undefined && !isValidBucketName(input.bucket)) throw new ParamInvalidError('bucket')
    if (input.key !== undefined && !isValidObjectName(input.key)) throw new ParamInvalidError('key')
    return endpoint
  }

  private buildRequest(input: OperationInput, endpoint: ParsedEndpoint): RequestMessage {
    // A serializer's `HeaderFields` is adopted as-is; a plain record is copied into a fresh one.
    const headers = isHeaderFields(input.headers) ? input.headers : createHeaderFields(input.headers)
    headers.set('User-Agent', this.innerOptions.userAgent)
    this.addDetectedContentType(input, headers)

    let url = endpoint.scheme + '://' + buildHostPath(input, endpoint.host, this.innerOptions.urlStyle)
    const parameters = input.parameters
    if (parameters !== undefined && Object.keys(parameters).length > 0) url += '?' + buildQueryString(parameters)

    return { method: input.method, url, headers, body: toByteContent(input.body) }
  }

  /** Completes an upload's serializer marker while the feature is enabled. */
  private addDetectedContentType(input: OperationInput, headers: RequestMessage['headers']): void {
    if (
      input.opMetadata?.[DETECT_CONTENT_TYPE] !== true ||
      (this.options.featureFlags & FeatureFlagsType.AUTO_DETECT_MIME_TYPE) === 0 ||
      headers.get('content-type') !== undefined ||
      input.key === undefined
    ) {
      return
    }
    const value = lookupMimeType(input.key, DEFAULT_CONTENT_TYPE)
    if (value !== undefined) headers.set('Content-Type', value)
  }

  private buildContext(
    input: OperationInput,
    request: RequestMessage,
    options?: OperationOptions,
    innerOptions?: OperationInnerOptions,
  ): ExecuteContext {
    const subResourceValue = input.opMetadata?.['subResource']
    const subResource = Array.isArray(subResourceValue) ? subResourceValue : undefined

    const signingContext: SigningContext = {
      product: this.options.product,
      region: this.options.region,
      bucket: input.bucket,
      key: input.key,
      subResource,
      additionalHeaderNames: this.options.additionalHeaders,
      clockOffset: this.innerOptions.clockOffset,
      authHeader: true,
      stringToSign: '',
      dateToSign: '',
      scopeToSign: '',
      additionalHeadersToSign: '',
    }

    // x-oss-date sets the signing time.
    const ossDate = request.headers.get('x-oss-date')
    if (ossDate !== undefined) signingContext.signTime = parseHttpTime(ossDate)

    // Resolve the upload total from the initial request body.
    const progressHandler = innerOptions?.progressHandler
    const progressObserver =
      progressHandler === undefined
        ? undefined
        : new ProgressObserver(progressHandler, resolveUploadTotal(request.body, request.headers))

    // Unset overrides use the retryer and transport defaults.
    return {
      retryMaxAttempts: options?.retryMaxAttempts,
      readWriteTimeoutMs: options?.readWriteTimeoutMs,
      signingContext,
      progressObserver,
      responseHandlers: innerOptions?.responseHandlers,
      signal: options?.signal,
      responseStream: toBoolean(input.opMetadata?.[RESPONSE_STREAM]),
    }
  }

  /** Stores the corrected clock offset for later operations. */
  private captureClockOffset(context: ExecuteContext, logger?: Logger): void {
    const offset = context.signingContext.clockOffset
    if (offset !== undefined && offset !== this.innerOptions.clockOffset) {
      this.innerOptions.clockOffset = offset
      logger?.warn('Corrected the client clock offset to ' + String(offset) + 'ms')
    }
  }
}

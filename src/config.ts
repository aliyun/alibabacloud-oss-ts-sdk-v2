import type { CredentialsProvider } from './credentials/types.js'
import type { Logger } from './log/logger.js'
import type { Retryer } from './retry/types.js'
import type { Signer } from './signer/types.js'
import type { HttpTransport } from './transport/types.js'

/** Configuration for the client. One of `region` / `endpoint` is required. */
export interface Config {
  /** The region in which the bucket is located, i.e., `cn-hangzhou`. */
  region?: string
  /** The domain names that other services can use to access OSS. Takes precedence over `region`. */
  endpoint?: string
  /** The credentials provider to use when signing requests. */
  credentialsProvider?: CredentialsProvider

  /**
   * Specifies the maximum number attempts an API client will call an operation that fails with a
   * retryable error. The default is 3.
   */
  retryMaxAttempts?: number
  /** Guides how HTTP requests should be retried in case of recoverable failures. */
  retryer?: Retryer

  /** The signature version when signing requests. Valid values v4, v1. The default is v4. */
  signerVersion?: string
  /** The signer to use when signing requests. Takes precedence over `signerVersion`. */
  signer?: Signer
  /** Additional signable headers. */
  additionalHeaders?: string[]
  /**
   * Turns off Content-Type auto-detection. By default the client detects a missing content type for
   * PutObject, AppendObject, and InitiateMultipartUpload from the object key.
   */
  disableAutoDetectMimeType?: boolean

  /**
   * Allows you to enable the client to use path-style addressing, i.e.,
   * https://oss-cn-hangzhou.aliyuncs.com/bucket/key. By default, the client will use virtual hosted
   * addressing i.e., https://bucket.oss-cn-hangzhou.aliyuncs.com/key.
   */
  usePathStyle?: boolean
  /** If the endpoint is a CName, set this flag to true. */
  useCname?: boolean
  /** Forces the endpoint to be resolved as HTTP. */
  disableSsl?: boolean
  /** Skips server-certificate verification when set. Off by default and honoured on node alone. */
  insecureSkipVerify?: boolean
  /**
   * Dual-stack endpoints are provided in some regions. This allows an IPv4 client and an IPv6 client to
   * access a bucket by using the same endpoint. Set this to `true` to use a dual-stack endpoint for the
   * requests.
   */
  useDualStackEndpoint?: boolean
  /**
   * You can use an internal endpoint to communicate between Alibaba Cloud services located within the
   * same region over the internal network. You are not charged for the traffic generated over the
   * internal network. Set this to `true` to use an internal endpoint for the requests.
   */
  useInternalEndpoint?: boolean
  /**
   * OSS provides the transfer acceleration feature to accelerate data transfers of data uploads and
   * downloads across countries and regions. Set this to `true` to use an accelerate endpoint for the
   * requests.
   */
  useAccelerateEndpoint?: boolean

  /** The optional user specific identifier appended to the User-Agent header. */
  userAgent?: string
  /**
   * The time in milliseconds till a timeout exception is thrown when attempting to make a connection.
   * The default is 5 seconds.
   */
  connectTimeoutMs?: number
  /**
   * The time in milliseconds till a timeout exception is thrown when attempting to read from or write
   * to a connection. The default is 20 seconds.
   */
  readWriteTimeoutMs?: number
  /** An interface for the SDK to log messages to. */
  logger?: Logger

  /**
   * A proxy to route requests through, given as a full URL such as
   * `http://user:pass@10.0.0.1:3128`. Node supports the full URL, OpenHarmony supports an
   * unauthenticated HTTP proxy, and browsers ignore this setting.
   */
  proxyHost?: string

  /**
   * Reserved for redirect control and currently ignored by the built-in transports. Node never
   * follows redirects; browsers and OpenHarmony use their platform defaults.
   */
  enabledRedirect?: boolean

  /** The HTTP transport to invoke API calls with. Defaults to the platform's own implementation. */
  transport?: HttpTransport
}

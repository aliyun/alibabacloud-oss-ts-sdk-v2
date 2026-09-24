import type { RequestModel, ResultModel } from './common.js'

/** The container that stores the Referer whitelist. */
export interface RefererList {
  /** The addresses in the Referer whitelist. */
  referers?: string[]
}

/** The container that stores the Referer blacklist. */
export interface RefererBlacklist {
  /** The addresses in the Referer blacklist. */
  referers?: string[]
}

/** The container that stores the hotlink protection configurations. */
export interface RefererConfiguration {
  /** Specifies whether to allow a request whose Referer field is empty. */
  allowEmptyReferer?: boolean
  /** Specifies whether to truncate the query string in the URL when the Referer is matched. */
  allowTruncateQueryString?: boolean
  /** Specifies whether to truncate the path and the parts that follow it when the Referer is matched. */
  truncatePath?: boolean
  /** The container that stores the Referer whitelist. */
  refererList?: RefererList
  /** The container that stores the Referer blacklist. */
  refererBlacklist?: RefererBlacklist
}

/** The request for the PutBucketReferer operation. */
export interface PutBucketRefererRequest extends RequestModel {
  /** The name of the bucket. Required. */
  bucket?: string
  /** The hotlink protection configuration. Left unset, the request body carries no configuration. */
  refererConfiguration?: RefererConfiguration
}

/** The result for the PutBucketReferer operation. OSS answers with an empty body. */
export type PutBucketRefererResult = ResultModel

/** The request for the GetBucketReferer operation. */
export interface GetBucketRefererRequest extends RequestModel {
  /** The name of the bucket. Required, and the only field. */
  bucket?: string
}

/** The result for the GetBucketReferer operation. */
export interface GetBucketRefererResult extends ResultModel {
  /** The container that stores the hotlink protection configurations. */
  refererConfiguration?: RefererConfiguration
}

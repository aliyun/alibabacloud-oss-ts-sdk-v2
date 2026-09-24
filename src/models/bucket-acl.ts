import type { AccessControlList, Owner } from './bucket-basic.js'
import type { RequestModel, ResultModel } from './common.js'

/** The container that stores the ACL information returned by GetBucketAcl. */
export interface AccessControlPolicy {
  /** The container that stores information about the bucket owner. */
  owner?: Owner
  /** The container that stores the ACL of the bucket. */
  accessControlList?: AccessControlList
}

/** The request for the PutBucketAcl operation. */
export interface PutBucketAclRequest extends RequestModel {
  /** The name of the bucket. Required. */
  bucket?: string
  /**
   * The ACL to configure for the bucket. Required, sent as the `x-oss-acl` header. Valid values:
   * private, public-read, public-read-write.
   */
  acl?: string
}

/** The result for the PutBucketAcl operation. OSS answers with an empty body. */
export type PutBucketAclResult = ResultModel

/** The request for the GetBucketAcl operation. */
export interface GetBucketAclRequest extends RequestModel {
  /** The name of the bucket. Required, and the only field. */
  bucket?: string
}

/** The result for the GetBucketAcl operation. */
export interface GetBucketAclResult extends ResultModel {
  /** The container that stores the ACL information. */
  accessControlPolicy?: AccessControlPolicy
}

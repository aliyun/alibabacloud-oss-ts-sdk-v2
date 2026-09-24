import type { AccessControlPolicy } from './bucket-acl.js'
import type { RequestModel, ResultModel } from './common.js'

/** The request for the PutObjectAcl operation. */
export interface PutObjectAclRequest extends RequestModel {
  /** The name of the bucket. Required. */
  bucket?: string
  /** The full path of the object. Required. */
  key?: string
  /**
   * The ACL to configure for the object. Required, sent as the `x-oss-object-acl` header. Valid
   * values: default, private, public-read, public-read-write.
   */
  objectAcl?: string
  /** The version ID of the object. */
  versionId?: string
}

/** The result for the PutObjectAcl operation. OSS answers with an empty body. */
export interface PutObjectAclResult extends ResultModel {
  /** The version ID of the object whose ACL was set. */
  versionId?: string
}

/** The request for the GetObjectAcl operation. */
export interface GetObjectAclRequest extends RequestModel {
  /** The name of the bucket. Required. */
  bucket?: string
  /** The full path of the object. Required. */
  key?: string
  /** The version ID of the object. */
  versionId?: string
}

/** The result for the GetObjectAcl operation. */
export interface GetObjectAclResult extends ResultModel {
  /** The container that stores the ACL information. */
  accessControlPolicy?: AccessControlPolicy
}

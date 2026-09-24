import type { RequestModel, ResultModel } from './common.js'

/** The request for the PutSymlink operation. */
export interface PutSymlinkRequest extends RequestModel {
  /** The name of the bucket. Required. */
  bucket?: string
  /** The full path of the symbolic link object. Required. */
  key?: string
  /**
   * The target object the symbolic link points to. Required, sent as the `x-oss-symlink-target`
   * header. Cannot itself be a symbolic link.
   */
  symlinkTarget?: string
  /** The ACL of the object. Valid values: default, private, public-read, public-read-write. */
  objectAcl?: string
  /** The storage class of the object. Valid values: Standard, IA, Archive, ColdArchive. */
  storageClass?: string
  /** Specifies whether the object with the same name is forbidden from being overwritten. */
  forbidOverwrite?: boolean
}

/** The result for the PutSymlink operation. OSS answers with an empty body. */
export interface PutSymlinkResult extends ResultModel {
  /** The version ID of the created symbolic link. */
  versionId?: string
}

/** The request for the GetSymlink operation. */
export interface GetSymlinkRequest extends RequestModel {
  /** The name of the bucket. Required. */
  bucket?: string
  /** The full path of the symbolic link object. Required. */
  key?: string
  /** The version ID of the object. */
  versionId?: string
}

/** The result for the GetSymlink operation. */
export interface GetSymlinkResult extends ResultModel {
  /** The target object the symbolic link points to. */
  symlinkTarget?: string
  /** The version ID of the object. */
  versionId?: string
}

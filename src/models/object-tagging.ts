import type { RequestModel, ResultModel } from './common.js'

/** A single tag, a key-value pair attached to an object. */
export interface Tag {
  /** The key of the tag. */
  key?: string
  /** The value of the tag. */
  value?: string
}

/** The container that stores the tags of an object. */
export interface TagSet {
  /** The tags. */
  tags?: Tag[]
}

/** The container that wraps the tag set in a tagging request or result. */
export interface Tagging {
  /** The tag set. */
  tagSet?: TagSet
}

/** The request for the PutObjectTagging operation. */
export interface PutObjectTaggingRequest extends RequestModel {
  /** The name of the bucket. Required. */
  bucket?: string
  /** The full path of the object. Required. */
  key?: string
  /** The version ID of the object. */
  versionId?: string
  /** The tags to attach to the object. */
  tagging?: Tagging
}

/** The result for the PutObjectTagging operation. OSS answers with an empty body. */
export interface PutObjectTaggingResult extends ResultModel {
  /** The version ID of the object whose tags were set. */
  versionId?: string
}

/** The request for the GetObjectTagging operation. */
export interface GetObjectTaggingRequest extends RequestModel {
  /** The name of the bucket. Required. */
  bucket?: string
  /** The full path of the object. Required. */
  key?: string
  /** The version ID of the object. */
  versionId?: string
}

/** The result for the GetObjectTagging operation. */
export interface GetObjectTaggingResult extends ResultModel {
  /** The tags attached to the object. */
  tagging?: Tagging
}

/** The request for the DeleteObjectTagging operation. */
export interface DeleteObjectTaggingRequest extends RequestModel {
  /** The name of the bucket. Required. */
  bucket?: string
  /** The full path of the object. Required. */
  key?: string
  /** The version ID of the object. */
  versionId?: string
}

/** The result for the DeleteObjectTagging operation. OSS answers with an empty body. */
export type DeleteObjectTaggingResult = ResultModel

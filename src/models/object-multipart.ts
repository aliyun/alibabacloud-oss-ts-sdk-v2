import type { RequestBody } from '../transport/types.js'
import type { RequestModel, ResultModel } from './common.js'

/** A part of a multipart upload. */
export interface Part {
  /** The number that identifies the part in the upload. Valid values: 1 to 10000. */
  partNumber?: number
  /** The ETag returned when the part was uploaded. */
  etag?: string
  /** The size of the part in bytes. Present in a ListParts result. */
  size?: number
  /** The time when the part was uploaded. Present in a ListParts result. */
  lastModified?: Date
}

/** An in-progress multipart upload, as listed by ListMultipartUploads. */
export interface Upload {
  /** The name of the object being uploaded. */
  key?: string
  /** The ID that identifies the multipart upload task. */
  uploadId?: string
  /** The time when the multipart upload task was initialized. */
  initiated?: string
}

/** The request for the InitiateMultipartUpload operation. */
export interface InitiateMultipartUploadRequest extends RequestModel {
  /** The name of the bucket. Required. */
  bucket?: string
  /** The full path of the object. Required. */
  key?: string
  /** The encoding type of the object name in the response. Valid value: url. */
  encodingType?: string
  /** The storage class of the object. Valid values: Standard, IA, Archive, ColdArchive. */
  storageClass?: string
  /** Specifies whether the object with the same name is forbidden from being overwritten. */
  forbidOverwrite?: boolean
  /** The tags of the object, as a key-value string. Example: TagA=A&TagB=B. */
  tagging?: string
  /** The server-side encryption method. Valid values: AES256, KMS, SM4. */
  serverSideEncryption?: string
  /** The server-side data encryption algorithm. */
  serverSideDataEncryption?: string
  /** The ID of the KMS customer master key, used when the encryption method is KMS. */
  serverSideEncryptionKeyId?: string
  /** The caching behavior of the web page when the object is downloaded. */
  cacheControl?: string
  /** The method that is used to access the object. */
  contentDisposition?: string
  /** The method that is used to encode the object. */
  contentEncoding?: string
  /** A standard MIME type describing the format of the contents. */
  contentType?: string
  /** The expiration time of the cache in UTC. */
  expires?: string
  /** The metadata of the object. Keys are sent as `x-oss-meta-<key>`. */
  metadata?: Record<string, string>
}

/** The result for the InitiateMultipartUpload operation. */
export interface InitiateMultipartUploadResult extends ResultModel {
  /** The name of the bucket to which the object is uploaded. */
  bucket?: string
  /** The full path of the object being uploaded. */
  key?: string
  /** The ID that identifies the multipart upload task. */
  uploadId?: string
  /** The encoding type of the object name in the response. */
  encodingType?: string
}

/** The request for the UploadPart operation. */
export interface UploadPartRequest extends RequestModel {
  /** The name of the bucket. Required. */
  bucket?: string
  /** The full path of the object. Required. */
  key?: string
  /** The ID that identifies the multipart upload task. Required. */
  uploadId?: string
  /** The number that identifies the part. Valid values: 1 to 10000. Required. */
  partNumber?: number
  /** Part data. Bytes, strings and a `FileContent` are replayable across retries; a `StreamContent` is not. */
  body?: RequestBody
}

/** The result for the UploadPart operation. */
export interface UploadPartResult extends ResultModel {
  /** The entity tag of the uploaded part. Paired with its part number in the CompleteMultipartUpload body. */
  etag?: string
  /** The 64-bit CRC value of the part, calculated based on the ECMA-182 standard. */
  hashCrc64ecma?: string
}

/** The request for the CompleteMultipartUpload operation. */
export interface CompleteMultipartUploadRequest extends RequestModel {
  /** The name of the bucket. Required. */
  bucket?: string
  /** The full path of the object. Required. */
  key?: string
  /** The ID that identifies the multipart upload task. Required. */
  uploadId?: string
  /** The encoding type of the object name in the response. Valid value: url. */
  encodingType?: string
  /** Specifies whether the object with the same name is forbidden from being overwritten. */
  forbidOverwrite?: boolean
  /**
   * Assembles every part already uploaded, when set to `yes`. When set, no `parts` list may be sent.
   */
  completeAll?: string
  /** The parts to assemble, each identified by its part number and ETag. Omit when `completeAll` is set. */
  parts?: Part[]
  /** The base64-encoded callback JSON, sent as `x-oss-callback` for the service to invoke on success. */
  callback?: string
  /** The base64-encoded callback variables, sent as `x-oss-callback-var`. */
  callbackVar?: string
}

/** The result for the CompleteMultipartUpload operation. */
export interface CompleteMultipartUploadResult extends ResultModel {
  /** The URL that is used to access the assembled object. */
  location?: string
  /** The name of the bucket that holds the object. */
  bucket?: string
  /** The full path of the assembled object. */
  key?: string
  /** The ETag of the assembled object. Not the MD5 of the content but a value from a fixed rule. */
  etag?: string
  /** The encoding type of the object name in the response. */
  encodingType?: string
  /** Version of the object. */
  versionId?: string
  /** The 64-bit CRC value of the object, calculated based on the ECMA-182 standard. */
  hashCrc64ecma?: string
  /**
   * The raw body the callback server returned. Present, and the XML fields absent, only when a
   * callback was requested: the service replaces the Complete XML with the callback reply.
   */
  callbackResult?: string
}

/** The request for the UploadPartCopy operation. */
export interface UploadPartCopyRequest extends RequestModel {
  /** The name of the destination bucket. Required. */
  bucket?: string
  /** The full path of the destination object. Required. */
  key?: string
  /** The ID that identifies the multipart upload task. Required. */
  uploadId?: string
  /** The number that identifies the part. Valid values: 1 to 10000. Required. */
  partNumber?: number
  /** The name of the source bucket. Defaults to `bucket` when omitted. */
  sourceBucket?: string
  /** The full path of the source object. Required. */
  sourceKey?: string
  /** The version ID of the source object. */
  sourceVersionId?: string
  /** The range of bytes to copy from the source object, for example `bytes=0-9`. */
  copySourceRange?: string
  /** Copies the part if the source ETag matches this value. */
  copySourceIfMatch?: string
  /** Copies the part if the source ETag does not match this value. */
  copySourceIfNoneMatch?: string
  /** Copies the part if the source has been modified since this time. */
  copySourceIfModifiedSince?: string
  /** Copies the part if the source has not been modified since this time. */
  copySourceIfUnmodifiedSince?: string
}

/** The result for the UploadPartCopy operation. */
export interface UploadPartCopyResult extends ResultModel {
  /** The time when the part was copied. */
  lastModified?: Date
  /** The ETag of the copied part. */
  etag?: string
  /** The version ID of the source object. */
  copySourceVersionId?: string
}

/** The request for the AbortMultipartUpload operation. */
export interface AbortMultipartUploadRequest extends RequestModel {
  /** The name of the bucket. Required. */
  bucket?: string
  /** The full path of the object. Required. */
  key?: string
  /** The ID that identifies the multipart upload task. Required. */
  uploadId?: string
}

/** The result for the AbortMultipartUpload operation. */
export type AbortMultipartUploadResult = ResultModel

/** The request for the ListMultipartUploads operation. */
export interface ListMultipartUploadsRequest extends RequestModel {
  /** The name of the bucket. Required. */
  bucket?: string
  /** The character that groups object names into common prefixes. */
  delimiter?: string
  /** The maximum number of multipart upload tasks to return. Default: 1000. */
  maxUploads?: number
  /** The object name after which the listing begins, together with `uploadIdMarker`. */
  keyMarker?: string
  /** The prefix that returned object names must contain. */
  prefix?: string
  /** The upload ID after which the listing begins, used together with `keyMarker`. */
  uploadIdMarker?: string
  /** The encoding type of the object names in the response. Valid value: url. */
  encodingType?: string
}

/** The result for the ListMultipartUploads operation. */
export interface ListMultipartUploadsResult extends ResultModel {
  /** The name of the bucket. */
  bucket?: string
  /** The object name after which the listing began. */
  keyMarker?: string
  /** The upload ID after which the listing began. */
  uploadIdMarker?: string
  /** The object name from which the next listing should begin. */
  nextKeyMarker?: string
  /** The upload ID from which the next listing should begin. */
  nextUploadIdMarker?: string
  /** The character used to group object names into common prefixes. */
  delimiter?: string
  /** The prefix that returned object names contain. */
  prefix?: string
  /** The maximum number of multipart upload tasks returned. */
  maxUploads?: number
  /** Whether the listing was truncated, meaning more tasks remain. */
  isTruncated?: boolean
  /** The encoding type of the object names in the response. */
  encodingType?: string
  /** The in-progress multipart uploads. */
  uploads?: Upload[]
}

/** The request for the ListParts operation. */
export interface ListPartsRequest extends RequestModel {
  /** The name of the bucket. Required. */
  bucket?: string
  /** The full path of the object. Required. */
  key?: string
  /** The ID that identifies the multipart upload task. Required. */
  uploadId?: string
  /** The maximum number of parts to return. Default: 1000. */
  maxParts?: number
  /** The part number after which the listing begins. */
  partNumberMarker?: number
  /** The encoding type of the object name in the response. Valid value: url. */
  encodingType?: string
}

/** The result for the ListParts operation. */
export interface ListPartsResult extends ResultModel {
  /** The name of the bucket. */
  bucket?: string
  /** The full path of the object. */
  key?: string
  /** The ID that identifies the multipart upload task. */
  uploadId?: string
  /** The part number after which the listing began. */
  partNumberMarker?: number
  /** The part number from which the next listing should begin. */
  nextPartNumberMarker?: number
  /** The maximum number of parts returned. */
  maxParts?: number
  /** Whether the listing was truncated, meaning more parts remain. */
  isTruncated?: boolean
  /** The encoding type of the object name in the response. */
  encodingType?: string
  /** The uploaded parts. */
  parts?: Part[]
}

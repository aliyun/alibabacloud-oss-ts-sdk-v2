import type { RequestBody, ResponseBody } from '../transport/types.js'
import type { RequestModel, ResultModel } from './common.js'

/** The request for the PutObject operation. */
export interface PutObjectRequest extends RequestModel {
  /** The name of the bucket. Required. */
  bucket?: string
  /** The full path of the object. Required. */
  key?: string
  /** Object data. Bytes, strings and a `FileContent` are replayable across retries; a `StreamContent` is not. */
  body?: RequestBody
  /** The caching behavior of the web page when the object is downloaded. */
  cacheControl?: string
  /** The method that is used to access the object. */
  contentDisposition?: string
  /** The method that is used to encode the object. */
  contentEncoding?: string
  /** The size of the data in the HTTP message body. Unit: bytes. */
  contentLength?: number
  /** The MD5 hash of the object that you want to upload, base64 of the raw digest. */
  contentMd5?: string
  /** A standard MIME type describing the format of the contents. */
  contentType?: string
  /** The expiration time of the cache in UTC. Echoed back verbatim, valid HTTP date or not. */
  expires?: string
  /**
   * Specifies whether the object that is uploaded by calling the PutObject operation overwrites an
   * existing object that has the same name.
   */
  forbidOverwrite?: boolean
  /** The access control list (ACL) of the object. */
  acl?: string
  /** The storage class of the object. Valid values: Standard, IA, Archive, ColdArchive. */
  storageClass?: string
  /** The metadata of the object that you want to upload. Keys are sent as `x-oss-meta-<key>`. */
  metadata?: Record<string, string>
  /**
   * The tags that are specified for the object by using a key-value pair. You can specify multiple
   * tags for an object. Example: TagA=A&TagB=B.
   */
  tagging?: string
  /**
   * Specify the speed limit value. The speed limit value ranges from 245760 to 838860800, with a
   * unit of bit/s.
   */
  trafficLimit?: number
  /**
   * To indicate that the requester is aware that the request and data download will incur costs.
   */
  requestPayer?: string
  /** The base64-encoded callback JSON, sent as `x-oss-callback` for the service to invoke on success. */
  callback?: string
  /** The base64-encoded callback variables, sent as `x-oss-callback-var`. */
  callbackVar?: string
}

/** The result for the PutObject operation. */
export interface PutObjectResult extends ResultModel {
  /** Content-Md5 for the uploaded object. */
  contentMd5?: string
  /** Entity tag for the uploaded object. */
  etag?: string
  /** The 64-bit CRC value of the object, calculated based on the ECMA-182 standard. */
  hashCrc64ecma?: string
  /** Version of the object. */
  versionId?: string
  /** The raw body the callback server returned, present only when a callback was requested. */
  callbackResult?: string
}

/**
 * The stored metadata both `GetObject` and `HeadObject` echo.
 *
 * Not every response header is modelled here. Reach the rest through `ResultModel.headers`.
 */
export interface ObjectMeta {
  /** Size of the body in bytes. */
  contentLength?: number
  /** A standard MIME type describing the format of the object data. */
  contentType?: string
  /** Content-Md5 for the uploaded object. */
  contentMd5?: string
  /**
   * The entity tag (ETag). An ETag is created when an object is created to identify the content of
   * the object.
   */
  etag?: string
  /** The time when the returned objects were last modified. */
  lastModified?: Date
  /** The caching behavior of the web page when the object is downloaded. */
  cacheControl?: string
  /** The method that is used to access the object. */
  contentDisposition?: string
  /** The method that is used to encode the object. */
  contentEncoding?: string
  /** The expiration time of the cache in UTC. Echoed back verbatim, valid HTTP date or not. */
  expires?: string
  /** The type of the object. Valid values: Normal, Multipart and Appendable. */
  objectType?: string
  /** The storage class of the object. */
  storageClass?: string
  /** The 64-bit CRC value of the object, calculated based on the ECMA-182 standard. */
  hashCrc64ecma?: string
  /** Version of the object. */
  versionId?: string
  /**
   * The number of tags added to the object. Present only when you have read permissions on tags.
   */
  taggingCount?: number
  /**
   * The lifecycle information about the object, present when lifecycle rules are configured for it:
   * an expiry-date that indicates the expiration time of the object, and a rule-id that indicates
   * the ID of the matched lifecycle rule.
   */
  expiration?: string
  /** The status of the object when you restore an object. */
  restore?: string
  /**
   * A map of metadata stored with the object, with the `x-oss-meta-` prefix stripped. Keys are
   * lowercased.
   */
  metadata?: Record<string, string>
}

/** The request for the GetObject operation. */
export interface GetObjectRequest extends RequestModel {
  /** The name of the bucket. Required. */
  bucket?: string
  /** The full path of the object. Required. */
  key?: string
  /**
   * If the ETag specified in the request matches the ETag value of the object, the object and 200
   * OK are returned. Otherwise, 412 Precondition Failed is returned.
   */
  ifMatch?: string
  /**
   * If the ETag specified in the request does not match the ETag value of the object, the object
   * and 200 OK are returned. Otherwise, 304 Not Modified is returned.
   */
  ifNoneMatch?: string
  /**
   * If the time specified in this header is earlier than the object modified time or is invalid,
   * the object and 200 OK are returned. Otherwise, 304 Not Modified is returned. The time must be
   * in GMT. Example: Fri, 13 Nov 2015 14:47:53 GMT.
   */
  ifModifiedSince?: string
  /**
   * If the time specified in this header is the same as or later than the object modified time, the
   * object and 200 OK are returned. Otherwise, 412 Precondition Failed is returned. The time must
   * be in GMT. Example: Fri, 13 Nov 2015 14:47:53 GMT.
   */
  ifUnmodifiedSince?: string
  /**
   * The content range of the object to be returned, for example `bytes=0-1023`. If the value of
   * Range is valid, the total size of the object and the content range are returned. If it is
   * invalid, the entire object is returned, and the response includes no Content-Range.
   */
  range?: string
  /**
   * Specify standard behaviors to download data by range. If the value is `standard`, a range whose
   * start is beyond the object returns 416 and the InvalidRange error code instead of the object.
   */
  rangeBehavior?: string
  /** VersionId used to reference a specific version of the object. */
  versionId?: string
  /** Image processing parameters. */
  process?: string
  /** The Cache-Control header to be returned in the response. */
  responseCacheControl?: string
  /** The Content-Disposition header to be returned in the response. */
  responseContentDisposition?: string
  /** The Content-Encoding header to be returned in the response. */
  responseContentEncoding?: string
  /** The Content-Language header to be returned in the response. */
  responseContentLanguage?: string
  /** The Content-Type header to be returned in the response. */
  responseContentType?: string
  /** The Expires header to be returned in the response. */
  responseExpires?: string
  /**
   * Specify the speed limit value. The speed limit value ranges from 245760 to 838860800, with a
   * unit of bit/s.
   */
  trafficLimit?: number
  /**
   * To indicate that the requester is aware that the request and data download will incur costs.
   */
  requestPayer?: string
}

/** The result for the GetObject operation. */
export interface GetObjectResult extends ResultModel, ObjectMeta {
  /** Object data. Read it exactly once, through `bytes()`, `text()` or `stream()`. */
  body?: ResponseBody
  /** The portion of the object returned in the response. Present only on a 206. */
  contentRange?: string
  /** Specifies whether the object retrieved was (true) or was not (false) a delete marker. */
  deleteMarker?: boolean
}

/** The request for the HeadObject operation. */
export interface HeadObjectRequest extends RequestModel {
  /** The name of the bucket. Required. */
  bucket?: string
  /** The full path of the object. Required. */
  key?: string
  /**
   * If the ETag specified in the request matches the ETag value of the object, the object meta and
   * 200 OK are returned. Otherwise, 412 Precondition Failed is returned.
   */
  ifMatch?: string
  /**
   * If the ETag specified in the request does not match the ETag value of the object, the object
   * meta and 200 OK are returned. Otherwise, 304 Not Modified is returned.
   */
  ifNoneMatch?: string
  /**
   * If the time specified in this header is earlier than the object modified time or is invalid,
   * the object meta and 200 OK are returned. Otherwise, 304 Not Modified is returned. The time must
   * be in GMT. Example: Fri, 13 Nov 2015 14:47:53 GMT.
   */
  ifModifiedSince?: string
  /**
   * If the time specified in this header is the same as or later than the object modified time, the
   * object meta and 200 OK are returned. Otherwise, 412 Precondition Failed is returned. The time
   * must be in GMT. Example: Fri, 13 Nov 2015 14:47:53 GMT.
   */
  ifUnmodifiedSince?: string
  /** The version ID of the source object. */
  versionId?: string
  /**
   * To indicate that the requester is aware that the request and data download will incur costs.
   */
  requestPayer?: string
}

/**
 * The result for the HeadObject operation. A HEAD returns the stored metadata and nothing else, so
 * this adds no members of its own.
 */
export interface HeadObjectResult extends ResultModel, ObjectMeta {}

/** The request for the DeleteObject operation. */
export interface DeleteObjectRequest extends RequestModel {
  /** The name of the bucket. Required. */
  bucket?: string
  /** The full path of the object. Required. */
  key?: string
  /** The version ID of the source object. */
  versionId?: string
  /**
   * To indicate that the requester is aware that the request and data download will incur costs.
   */
  requestPayer?: string
}

/** The result for the DeleteObject operation. */
export interface DeleteObjectResult extends ResultModel {
  /** Version of the object. */
  versionId?: string
  /** Specifies whether the object retrieved was (true) or was not (false) a delete marker. */
  deleteMarker?: boolean
}

/** The request for the CopyObject operation. */
export interface CopyObjectRequest extends RequestModel {
  /** The name of the destination bucket. Required. */
  bucket?: string
  /** The full path of the destination object. Required. */
  key?: string
  /** The full path of the source object. Required. */
  sourceKey?: string
  /** The name of the source bucket. Defaults to `bucket` when omitted. */
  sourceBucket?: string
  /** The version ID of the source object. */
  sourceVersionId?: string
  /** Specifies whether the CopyObject operation overwrites an object that has the same name. */
  forbidOverwrite?: boolean
  /** Copies the object if its ETag matches this value. */
  copySourceIfMatch?: string
  /** Copies the object if its ETag does not match this value. */
  copySourceIfNoneMatch?: string
  /** Copies the object if it has been modified since this time. */
  copySourceIfModifiedSince?: string
  /** Copies the object if it has not been modified since this time. */
  copySourceIfUnmodifiedSince?: string
  /** How the destination metadata is set. Valid values: COPY, REPLACE. */
  metadataDirective?: string
  /** The server-side encryption method. Valid values: AES256, KMS, SM4. */
  serverSideEncryption?: string
  /** The server-side data encryption algorithm. */
  serverSideDataEncryption?: string
  /** The ID of the KMS customer master key, used when the encryption method is KMS. */
  serverSideEncryptionKeyId?: string
  /** The access control list (ACL) of the destination object. */
  acl?: string
  /** The storage class of the destination object. Valid values: Standard, IA, Archive, ColdArchive. */
  storageClass?: string
  /** The tags of the destination object, as a key-value string. Example: TagA=A&TagB=B. */
  tagging?: string
  /** How the destination tags are set. Valid values: Copy, Replace. */
  taggingDirective?: string
  /** The metadata of the destination object. Keys are sent as `x-oss-meta-<key>`. */
  metadata?: Record<string, string>
  /**
   * To indicate that the requester is aware that the request and data download will incur costs.
   */
  requestPayer?: string
}

/** The result for the CopyObject operation. */
export interface CopyObjectResult extends ResultModel {
  /** The time when the destination object was last modified. */
  lastModified?: Date
  /** The ETag of the destination object. */
  etag?: string
  /** The version ID of the source object. */
  copySourceVersionId?: string
  /** The version ID of the destination object. */
  versionId?: string
}

/** The request for the AppendObject operation. */
export interface AppendObjectRequest extends RequestModel {
  /** The name of the bucket. Required. */
  bucket?: string
  /** The full path of the object. Required. */
  key?: string
  /** Object data. Bytes, strings and a `FileContent` are replayable across retries; a `StreamContent` is not. */
  body?: RequestBody
  /**
   * The position from which the append starts. The first append must use 0; each later one uses the
   * `nextAppendPosition` the previous result returned. Required.
   */
  position?: number
  /** A standard MIME type describing the format of the contents. */
  contentType?: string
  /** The caching behavior of the web page when the object is downloaded. */
  cacheControl?: string
  /** The method that is used to access the object. */
  contentDisposition?: string
  /** The method that is used to encode the object. */
  contentEncoding?: string
  /** The MD5 hash of the object that you want to append, base64 of the raw digest. */
  contentMd5?: string
  /** The expiration time of the cache in UTC. Echoed back verbatim, valid HTTP date or not. */
  expires?: string
  /** The access control list (ACL) of the object. */
  acl?: string
  /** The server-side encryption method. Valid values: AES256, KMS, SM4. */
  serverSideEncryption?: string
  /** The storage class of the object. Valid values: Standard, IA, Archive. */
  storageClass?: string
  /** The metadata of the object. Keys are sent as `x-oss-meta-<key>`. */
  metadata?: Record<string, string>
  /**
   * To indicate that the requester is aware that the request and data download will incur costs.
   */
  requestPayer?: string
}

/** The result for the AppendObject operation. */
export interface AppendObjectResult extends ResultModel {
  /** The position from which the next append should start. */
  nextAppendPosition?: number
  /** The 64-bit CRC value of the object, calculated based on the ECMA-182 standard. */
  hashCrc64ecma?: string
  /** Version of the object. */
  versionId?: string
}

/** The identifier of an object to delete. */
export interface ObjectIdentifier {
  /** The name of the object. Required. */
  key: string
  /** The version ID of the object. */
  versionId?: string
}

/** The request for the DeleteMultipleObjects operation. */
export interface DeleteMultipleObjectsRequest extends RequestModel {
  /** The name of the bucket. Required. */
  bucket?: string
  /** The objects to delete. Required. */
  objects?: ObjectIdentifier[]
  /** Specifies whether to enable the Quiet return mode, which omits the deleted objects. */
  quiet?: boolean
  /**
   * To indicate that the requester is aware that the request and data download will incur costs.
   */
  requestPayer?: string
}

/** The information about a deleted object. */
export interface DeletedObject {
  /** The name of the deleted object. */
  key?: string
  /** The version ID of the object that was deleted. */
  versionId?: string
  /** Indicates whether the deleted version is a delete marker. */
  deleteMarker?: boolean
  /** The version ID of the delete marker. */
  deleteMarkerVersionId?: string
}

/** The result for the DeleteMultipleObjects operation. */
export interface DeleteMultipleObjectsResult extends ResultModel {
  /** The information about the objects that were deleted. */
  deleted?: DeletedObject[]
  /** The encoding type of the object names in the response. */
  encodingType?: string
}

/** The request for the GetObjectMeta operation. */
export interface GetObjectMetaRequest extends RequestModel {
  /** The name of the bucket. Required. */
  bucket?: string
  /** The full path of the object. Required. */
  key?: string
  /** The version ID of the object. */
  versionId?: string
  /**
   * To indicate that the requester is aware that the request and data download will incur costs.
   */
  requestPayer?: string
}

/**
 * The result for the GetObjectMeta operation. Unlike HeadObject, it returns a small fixed set of
 * fields and does not echo the stored user metadata.
 */
export interface GetObjectMetaResult extends ResultModel {
  /** Size of the body in bytes. */
  contentLength?: number
  /** The entity tag (ETag). */
  etag?: string
  /** The time when the object was last modified. */
  lastModified?: Date
  /** The time when the object was last accessed. */
  lastAccessTime?: string
  /** The time when the storage class of the object was changed to Archive or Cold Archive. */
  transitionTime?: string
  /** Version of the object. */
  versionId?: string
}

/** The restoration priority configuration, used only for Cold Archive objects. */
export interface JobParameters {
  /** The restoration priority. Valid values: Expedited, Standard, Bulk. */
  tier?: string
}

/** The body of a RestoreObject request. */
export interface RestoreRequest {
  /** The number of days the object stays in the restored state. */
  days?: number
  /** The restoration priority configuration for Cold Archive objects. */
  jobParameters?: JobParameters
}

/** The request for the RestoreObject operation. */
export interface RestoreObjectRequest extends RequestModel {
  /** The name of the bucket. Required. */
  bucket?: string
  /** The full path of the object. Required. */
  key?: string
  /** The version ID of the object to restore. */
  versionId?: string
  /** The restoration parameters. Omit to restore an Archive object with the defaults. */
  restoreRequest?: RestoreRequest
  /**
   * To indicate that the requester is aware that the request and data download will incur costs.
   */
  requestPayer?: string
}

/** The result for the RestoreObject operation. */
export interface RestoreObjectResult extends ResultModel {
  /** The restoration priority of the object. */
  objectRestorePriority?: string
  /** Version of the object. */
  versionId?: string
}

/** The request for the CleanRestoredObject operation. */
export interface CleanRestoredObjectRequest extends RequestModel {
  /** The name of the bucket. Required. */
  bucket?: string
  /** The full path of the object. Required. */
  key?: string
  /**
   * To indicate that the requester is aware that the request and data download will incur costs.
   */
  requestPayer?: string
}

/** The result for the CleanRestoredObject operation. */
export type CleanRestoredObjectResult = ResultModel

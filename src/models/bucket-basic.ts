import type { RequestModel, ResultModel } from './common.js'

/** The configuration information for the bucket. */
export interface CreateBucketConfiguration {
  /**
   * The storage class of the bucket. Valid values: Standard, IA, Archive, ColdArchive,
   * DeepColdArchive. Left unset, OSS creates a Standard bucket.
   */
  storageClass?: string
  /** The redundancy type of the bucket. Valid values: LRS, ZRS. */
  dataRedundancyType?: string
}

/** The request for the PutBucket operation. */
export interface PutBucketRequest extends RequestModel {
  /** The name of the bucket to create. Required. */
  bucket?: string
  /**
   * The access control list (ACL) of the bucket. Valid values: private, public-read,
   * public-read-write. Left unset, OSS creates the bucket private.
   */
  acl?: string
  /** The ID of the resource group. Left unset, OSS assigns a resource group itself. */
  resourceGroupId?: string
  /** The configuration information for the bucket. */
  createBucketConfiguration?: CreateBucketConfiguration
}

/** The result for the PutBucket operation. OSS answers with an empty body. */
export type PutBucketResult = ResultModel

/** The request for the DeleteBucket operation. */
export interface DeleteBucketRequest extends RequestModel {
  /** The name of the bucket to delete. Required, and the only field. */
  bucket?: string
}

/** The result for the DeleteBucket operation. OSS answers 204. */
export type DeleteBucketResult = ResultModel

/** The container that stores information about the bucket owner. */
export interface Owner {
  /** The ID of the bucket owner. */
  id?: string
  /** The name of the object owner. */
  displayName?: string
}

/** The ACL grant of a bucket, as reported inside `GetBucketInfo`. */
export interface AccessControlList {
  /** The ACL of the bucket. Valid values: private, public-read, public-read-write. */
  grant?: string
}

/** The metadata of one object in a listing. */
export interface ObjectProperties {
  /** The name of the object. */
  key?: string
  /** The type of the object. Valid values: Normal, Multipart and Appendable. */
  type?: string
  /** The size of the returned object. Unit: bytes. */
  size?: number
  /**
   * The entity tag (ETag). An ETag is created when an object is created to identify the content of
   * the object.
   */
  etag?: string
  /** The time when the returned objects were last modified. */
  lastModified?: Date
  /** The storage class of the object. */
  storageClass?: string
  /**
   * The container that stores information about the bucket owner. Present only when the request set
   * `fetchOwner`.
   */
  owner?: Owner
  /** The restoration status of the object. */
  restoreInfo?: string
  /**
   * The time when the storage class of the object is converted to Cold Archive or Deep Cold Archive
   * based on lifecycle rules.
   */
  transitionTime?: Date
}

/** One group of object names folded together by the delimiter. */
export interface CommonPrefix {
  /** The prefix contained in the returned object names. */
  prefix?: string
}

/** The request for the ListObjectsV2 operation. */
export interface ListObjectsV2Request extends RequestModel {
  /** The name of the bucket containing the objects. Required. */
  bucket?: string
  /**
   * The character that is used to group objects by name. The objects whose names contain the same
   * string from the prefix to the next occurrence of the delimiter are grouped as a single result
   * element in CommonPrefixes.
   */
  delimiter?: string
  /**
   * The name of the object after which the ListObjectsV2 operation starts. The objects are returned
   * in alphabetical order of their names.
   */
  startAfter?: string
  /**
   * The token from which the ListObjectsV2 operation must start. You can obtain the token from the
   * `nextContinuationToken` of a previous ListObjectsV2 result.
   */
  continuationToken?: string
  /**
   * The maximum number of objects that you want to return. Valid values: 1 to 999. Default value:
   * 100. Whatever OSS applies comes back on the result's `maxKeys`.
   */
  maxKeys?: number
  /** The prefix that the names of the returned objects must contain. */
  prefix?: string
  /** The encoding type of the content in the response. Valid value: url. */
  encodingType?: string
  /** Specifies whether to include information about the object owner in the response. */
  fetchOwner?: boolean
  /**
   * To indicate that the requester is aware that the request and data download will incur costs.
   */
  requestPayer?: string
}

/** The result for the ListObjectsV2 operation. */
export interface ListObjectsV2Result extends ResultModel {
  /** The name of the bucket. */
  name?: string
  /** The prefix contained in the returned object names. */
  prefix?: string
  /** If the StartAfter parameter is specified in the request, the response contains it. */
  startAfter?: string
  /** The maximum number of returned objects in the response. */
  maxKeys?: number
  /** The character that is used to group objects by name. */
  delimiter?: string
  /**
   * Indicates whether the returned results are truncated. true indicates that not all results are
   * returned this time, and `nextContinuationToken` is the cursor for the rest.
   */
  isTruncated?: boolean
  /** If the ContinuationToken parameter is specified in the request, the response contains it. */
  continuationToken?: string
  /**
   * The name of the object from which the next ListObjectsV2 operation starts. Pass it as the
   * `continuationToken` of the next request.
   */
  nextContinuationToken?: string
  /** The encoding type of the content in the response. */
  encodingType?: string
  /**
   * The container that stores the metadata of the returned objects. Absent, not empty, when the
   * listing matched nothing.
   */
  contents?: ObjectProperties[]
  /** If the Delimiter parameter is specified in the request, the response contains this element. */
  commonPrefixes?: CommonPrefix[]
  /**
   * The number of objects returned for this request. If a delimiter is specified, it is the sum of
   * the `contents` and `commonPrefixes` counts.
   */
  keyCount?: number
}

/** The request for the ListObjects (V1) operation. */
export interface ListObjectsRequest extends RequestModel {
  /** The name of the bucket containing the objects. Required. */
  bucket?: string
  /** The character that is used to group objects by name into `commonPrefixes`. */
  delimiter?: string
  /**
   * The name of the object after which the listing starts. Objects are returned in alphabetical
   * order of their names; page by feeding the result's `nextMarker` back as `marker`.
   */
  marker?: string
  /** The maximum number of objects to return. Valid values: 1 to 999. Default value: 100. */
  maxKeys?: number
  /** The prefix that the names of the returned objects must contain. */
  prefix?: string
  /** The encoding type of the content in the response. Valid value: url. */
  encodingType?: string
  /**
   * To indicate that the requester is aware that the request and data download will incur costs.
   */
  requestPayer?: string
}

/** The result for the ListObjects (V1) operation. */
export interface ListObjectsResult extends ResultModel {
  /** The name of the bucket. */
  name?: string
  /** The prefix contained in the returned object names. */
  prefix?: string
  /** The name of the object after which the listing started. */
  marker?: string
  /** The maximum number of returned objects in the response. */
  maxKeys?: number
  /** The character that is used to group objects by name. */
  delimiter?: string
  /**
   * Indicates whether the returned results are truncated. true indicates that not all results are
   * returned this time, and `nextMarker` is the cursor for the rest.
   */
  isTruncated?: boolean
  /** The name of the object from which the next listing starts. Pass it as the next `marker`. */
  nextMarker?: string
  /** The encoding type of the content in the response. */
  encodingType?: string
  /** The container that stores the metadata of the returned objects. Absent when nothing matched. */
  contents?: ObjectProperties[]
  /** If the Delimiter parameter is specified in the request, the response contains this element. */
  commonPrefixes?: CommonPrefix[]
}

/** The server-side encryption configuration of a bucket. */
export interface ServerSideEncryptionRule {
  /** The default server-side encryption method. Valid values: KMS, AES256, SM4. */
  sseAlgorithm?: string
  /** The key managed by Key Management Service (KMS). */
  kmsMasterKeyId?: string
  /** The algorithm used to encrypt objects, valid only when `sseAlgorithm` is KMS. */
  kmsDataEncryption?: string
}

/** The access-logging configuration of a bucket. */
export interface BucketPolicy {
  /** The directory used to store access logs. */
  logPrefix?: string
  /** The name of the bucket used to store access logs. */
  logBucket?: string
}

/** The container that stores the bucket information returned by GetBucketInfo. */
export interface BucketInfo {
  /** The region in which the bucket is located. */
  location?: string
  /** The name of the bucket. */
  name?: string
  /** The storage class of the bucket. */
  storageClass?: string
  /** The redundancy type of the bucket. */
  dataRedundancyType?: string
  /** The time when the bucket was created. */
  creationDate?: string
  /** The public endpoint of the bucket. */
  extranetEndpoint?: string
  /** The internal endpoint of the bucket. */
  intranetEndpoint?: string
  /** The bucket description. */
  comment?: string
  /** The owner of the bucket. */
  owner?: Owner
  /** Whether transfer acceleration is enabled. Valid values: Enabled, Disabled. */
  transferAcceleration?: string
  /** Whether access tracking is enabled. Valid values: Enabled, Disabled. */
  accessMonitor?: string
  /** The ID of the resource group to which the bucket belongs. */
  resourceGroupId?: string
  /** The ACL of the bucket. */
  accessControlList?: AccessControlList
  /** Whether the bucket blocks public access. */
  blockPublicAccess?: boolean
  /** Whether cross-region replication is enabled. Valid values: Enabled, Disabled. */
  crossRegionReplication?: string
  /** The server-side encryption configuration of the bucket. */
  serverSideEncryptionRule?: ServerSideEncryptionRule
  /** The access-logging configuration of the bucket. */
  bucketPolicy?: BucketPolicy
  /** The versioning status of the bucket. */
  versioning?: string
  /** The resource type of the bucket. */
  bucketResourceType?: string
  /** The agentic bucket name of the bucket. */
  agenticBucketName?: string
}

/** The request for the GetBucketInfo operation. */
export interface GetBucketInfoRequest extends RequestModel {
  /** The name of the bucket. Required, and the only field. */
  bucket?: string
}

/** The result for the GetBucketInfo operation. */
export interface GetBucketInfoResult extends ResultModel {
  /** The container that stores the information about the bucket. */
  bucketInfo?: BucketInfo
}

/** The request for the GetBucketLocation operation. */
export interface GetBucketLocationRequest extends RequestModel {
  /** The name of the bucket. Required, and the only field. */
  bucket?: string
}

/** The result for the GetBucketLocation operation. */
export interface GetBucketLocationResult extends ResultModel {
  /** The region in which the bucket resides, e.g. oss-cn-hangzhou. */
  locationConstraint?: string
}

/**
 * The storage usage and object counts of a bucket, broken down by storage class. Every field is a
 * count or a byte total; `lastModifiedTime` is a UNIX timestamp in seconds.
 */
export interface BucketStat {
  storage?: number
  objectCount?: number
  multipartUploadCount?: number
  multipartPartCount?: number
  liveChannelCount?: number
  lastModifiedTime?: number
  standardStorage?: number
  standardObjectCount?: number
  standardMultipartPartCount?: number
  standardMultipartPartStorage?: number
  infrequentAccessStorage?: number
  infrequentAccessRealStorage?: number
  infrequentAccessObjectCount?: number
  infrequentMultipartPartCount?: number
  infrequentMultipartPartStorage?: number
  archiveStorage?: number
  archiveRealStorage?: number
  archiveObjectCount?: number
  archiveMultipartPartCount?: number
  archiveMultipartPartStorage?: number
  coldArchiveStorage?: number
  coldArchiveRealStorage?: number
  coldArchiveObjectCount?: number
  coldArchiveMultipartPartCount?: number
  coldArchiveMultipartPartStorage?: number
  deepColdArchiveStorage?: number
  deepColdArchiveRealStorage?: number
  deepColdArchiveObjectCount?: number
  deepColdArchiveMultipartPartCount?: number
  deepColdArchiveMultipartPartStorage?: number
  deleteMarkerCount?: number
  multipartPartStorage?: number
}

/** The request for the GetBucketStat operation. */
export interface GetBucketStatRequest extends RequestModel {
  /** The name of the bucket. Required, and the only field. */
  bucket?: string
}

/** The result for the GetBucketStat operation. */
export interface GetBucketStatResult extends ResultModel {
  /** The container that stores the storage usage and object counts of the bucket. */
  bucketStat?: BucketStat
}

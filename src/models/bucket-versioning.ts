import type { CommonPrefix, Owner } from './bucket-basic.js'
import type { RequestModel, ResultModel } from './common.js'

/** The container that stores the versioning state of the bucket. */
export interface VersioningConfiguration {
  /** The versioning state of the bucket. Valid values: Enabled, Suspended. */
  status?: string
}

/** The request for the PutBucketVersioning operation. */
export interface PutBucketVersioningRequest extends RequestModel {
  /** The name of the bucket. Required. */
  bucket?: string
  /** The versioning state to set. Left unset, the request body carries no configuration. */
  versioningConfiguration?: VersioningConfiguration
}

/** The result for the PutBucketVersioning operation. OSS answers with an empty body. */
export type PutBucketVersioningResult = ResultModel

/** The request for the GetBucketVersioning operation. */
export interface GetBucketVersioningRequest extends RequestModel {
  /** The name of the bucket. Required, and the only field. */
  bucket?: string
}

/** The result for the GetBucketVersioning operation. */
export interface GetBucketVersioningResult extends ResultModel {
  /** The container that stores the versioning state of the bucket. */
  versioningConfiguration?: VersioningConfiguration
}

/** One versioned object in a ListObjectVersions listing, delete markers excluded. */
export interface ObjectVersion {
  /** The name of the object. */
  key?: string
  /** The version ID of the object. */
  versionId?: string
  /** Indicates whether the version is the current version. */
  isLatest?: boolean
  /** The time when the object was last modified. */
  lastModified?: Date
  /** The ETag of the object. */
  etag?: string
  /** The size of the object. Unit: bytes. */
  size?: number
  /** The storage class of the object. */
  storageClass?: string
  /** The container for the information about the bucket owner. */
  owner?: Owner
  /** The restoration status of the object version. */
  restoreInfo?: string
}

/** One delete marker in a ListObjectVersions listing. */
export interface DeleteMarkerEntry {
  /** The name of the object. */
  key?: string
  /** The version ID of the object. */
  versionId?: string
  /** Indicates whether the version is the current version. */
  isLatest?: boolean
  /** The time when the object was last modified. */
  lastModified?: Date
  /** The container for the information about the bucket owner. */
  owner?: Owner
}

/** The request for the ListObjectVersions operation. */
export interface ListObjectVersionsRequest extends RequestModel {
  /** The name of the bucket. Required. */
  bucket?: string
  /** The character that is used to group objects by name. */
  delimiter?: string
  /** The name of the object after which the list operation begins. */
  keyMarker?: string
  /** The version ID of the object specified in `keyMarker` after which the list operation begins. */
  versionIdMarker?: string
  /** The maximum number of objects to be returned. */
  maxKeys?: number
  /** The prefix that the names of returned objects must contain. */
  prefix?: string
  /** The encoding type of the content in the response. Valid value: url. */
  encodingType?: string
}

/** The result for the ListObjectVersions operation. */
export interface ListObjectVersionsResult extends ResultModel {
  /** The bucket name. */
  name?: string
  /** The prefix contained in the names of the returned objects. */
  prefix?: string
  /** Indicates the object from which the list operation starts. */
  keyMarker?: string
  /** The version from which the list operation starts. */
  versionIdMarker?: string
  /** If not all results are returned, the `keyMarker` for the next request. */
  nextKeyMarker?: string
  /** If not all results are returned, the `versionIdMarker` for the next request. */
  nextVersionIdMarker?: string
  /** The maximum number of objects that can be returned in the response. */
  maxKeys?: number
  /** The delimiter used to group objects by name. */
  delimiter?: string
  /** Indicates whether the returned results are truncated. */
  isTruncated?: boolean
  /** The encoding type of the content in the response. */
  encodingType?: string
  /** The container that stores the versions of objects, delete markers excluded. */
  versions?: ObjectVersion[]
  /** The container that stores delete markers. */
  deleteMarkers?: DeleteMarkerEntry[]
  /** The objects grouped together by the delimiter. */
  commonPrefixes?: CommonPrefix[]
}

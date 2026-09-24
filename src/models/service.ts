import type { RequestModel, ResultModel } from './common.js'
import type { Owner } from './bucket-basic.js'

/** The information about one bucket in a ListBuckets result. */
export interface BucketSummary {
  /** The name of the bucket. */
  name?: string
  /** The region in which the bucket is located. */
  region?: string
  /** The data center in which the bucket is located. */
  location?: string
  /** The storage class of the bucket. Valid values: Standard, IA, Archive, ColdArchive. */
  storageClass?: string
  /** The public endpoint of the region in which the bucket resides. */
  extranetEndpoint?: string
  /** The internal endpoint, reachable from an ECS instance in the same region as the bucket. */
  intranetEndpoint?: string
  /** The time when the bucket was created. */
  creationDate?: Date
}

/** The request for the ListBuckets operation. */
export interface ListBucketsRequest extends RequestModel {
  /** The ID of the resource group to which the returned buckets belong. */
  resourceGroupId?: string
  /** The prefix that the names of returned buckets must contain. */
  prefix?: string
  /**
   * The name of the bucket after which the listing starts. Buckets whose names sort after `marker`
   * are returned; pass the result's `nextMarker` to continue a truncated listing.
   */
  marker?: string
  /** The maximum number of buckets to return. Valid values: 1 to 1000. Default value: 100. */
  maxKeys?: number
  /** A tag key: only buckets tagged with this key are returned. */
  tagKey?: string
  /** A tag value: requires `tagKey`, and only buckets tagged with the pair are returned. */
  tagValue?: string
}

/** The result for the ListBuckets operation. */
export interface ListBucketsResult extends ResultModel {
  /** The prefix contained in the names of returned buckets. */
  prefix?: string
  /** The name of the bucket from which the listing started. */
  marker?: string
  /** The maximum number of buckets that could be returned. */
  maxKeys?: number
  /** Indicates whether the results are truncated; if so, continue with `nextMarker`. */
  isTruncated?: boolean
  /** The marker for the next ListBuckets request when the results are truncated. */
  nextMarker?: string
  /** The bucket owner. */
  owner?: Owner
  /** The returned buckets. Absent, not empty, when the listing matched nothing. */
  buckets?: BucketSummary[]
}

/** The information about one region in a DescribeRegions result. */
export interface RegionInfo {
  /** The region ID, e.g. oss-cn-hangzhou. */
  region?: string
  /** The public endpoint of the region. */
  internetEndpoint?: string
  /** The internal endpoint of the region. */
  internalEndpoint?: string
  /** The acceleration endpoint of the region. */
  accelerateEndpoint?: string
}

/** The request for the DescribeRegions operation. */
export interface DescribeRegionsRequest extends RequestModel {
  /** A single region ID to describe. Left unset, OSS returns every region. */
  regions?: string
}

/** The result for the DescribeRegions operation. */
export interface DescribeRegionsResult extends ResultModel {
  /** The returned regions. Absent, not empty, when the response carried none. */
  regionInfo?: RegionInfo[]
}

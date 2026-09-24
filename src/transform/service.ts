import { DeserializationError } from '../error/types.js'
import type { OperationInput, OperationOutput } from '../types.js'
import { createHeaderFields } from '../utils/header-fields.js'
import { copyInto } from '../utils/record.js'
import type { XmlNode } from '../xml/parse.js'
import { childOf, childrenOf, parseXml, textOf } from '../xml/parse.js'
import type { Owner } from '../models/bucket-basic.js'
import type {
  BucketSummary,
  DescribeRegionsRequest,
  DescribeRegionsResult,
  ListBucketsRequest,
  ListBucketsResult,
  RegionInfo,
} from '../models/service.js'
import { resultCommon, setDefaultContentMd5, setHeaderString, setNumber, setString, toBoolean, toDate, toNumber } from './common.js'

/** A missing or foreign root is an error, not an empty result: a 200 that is not this listing means something else answered. */
function parseRoot(text: string, expected: string): XmlNode {
  let root: XmlNode
  try {
    root = parseXml(text)
  } catch (err) {
    throw new DeserializationError('the response body is not XML', err instanceof Error ? err : undefined)
  }
  if (root.name !== expected) {
    throw new DeserializationError('expected element type <' + expected + '> but have <' + root.name + '>')
  }
  return root
}

function readOwner(node: XmlNode): Owner | undefined {
  const owner = childOf(node, 'Owner')
  if (owner === undefined) return undefined
  return { id: textOf(owner, 'ID'), displayName: textOf(owner, 'DisplayName') }
}

export function serializeListBuckets(request: ListBucketsRequest): OperationInput {
  const headers = createHeaderFields(request.headers)
  setHeaderString(headers, 'x-oss-resource-group-id', request.resourceGroupId)
  setDefaultContentMd5(headers)

  const parameters: Record<string, string> = {}
  copyInto(parameters, request.parameters)
  setString(parameters, 'prefix', request.prefix)
  setString(parameters, 'marker', request.marker)
  setNumber(parameters, 'max-keys', request.maxKeys)
  setString(parameters, 'tag-key', request.tagKey)
  setString(parameters, 'tag-value', request.tagValue)

  return { opName: 'ListBuckets', method: 'GET', headers, parameters }
}

function readBucket(node: XmlNode): BucketSummary {
  return {
    name: textOf(node, 'Name'),
    region: textOf(node, 'Region'),
    location: textOf(node, 'Location'),
    storageClass: textOf(node, 'StorageClass'),
    extranetEndpoint: textOf(node, 'ExtranetEndpoint'),
    intranetEndpoint: textOf(node, 'IntranetEndpoint'),
    creationDate: toDate(textOf(node, 'CreationDate')),
  }
}

export async function deserializeListBuckets(output: OperationOutput): Promise<ListBucketsResult> {
  const common = resultCommon(output)
  const root = parseRoot(output.body === undefined ? '' : await output.body.text(), 'ListAllMyBucketsResult')

  const buckets: BucketSummary[] = []
  const container = childOf(root, 'Buckets')
  if (container !== undefined) {
    for (const node of childrenOf(container, 'Bucket')) buckets.push(readBucket(node))
  }

  return {
    status: common.status,
    statusCode: common.statusCode,
    requestId: common.requestId,
    headers: common.headers,
    prefix: textOf(root, 'Prefix'),
    marker: textOf(root, 'Marker'),
    maxKeys: toNumber(textOf(root, 'MaxKeys')),
    isTruncated: toBoolean(textOf(root, 'IsTruncated')),
    nextMarker: textOf(root, 'NextMarker'),
    owner: readOwner(root),
    buckets: buckets.length > 0 ? buckets : undefined,
  }
}

export function serializeDescribeRegions(request: DescribeRegionsRequest): OperationInput {
  const headers = createHeaderFields(request.headers)
  setDefaultContentMd5(headers)

  // `regions` is the sub-resource that names the operation; empty asks for every region.
  const parameters: Record<string, string> = { regions: '' }
  copyInto(parameters, request.parameters)
  setString(parameters, 'regions', request.regions)

  return { opName: 'DescribeRegions', method: 'GET', headers, parameters }
}

function readRegionInfo(node: XmlNode): RegionInfo {
  return {
    region: textOf(node, 'Region'),
    internetEndpoint: textOf(node, 'InternetEndpoint'),
    internalEndpoint: textOf(node, 'InternalEndpoint'),
    accelerateEndpoint: textOf(node, 'AccelerateEndpoint'),
  }
}

export async function deserializeDescribeRegions(output: OperationOutput): Promise<DescribeRegionsResult> {
  const common = resultCommon(output)
  const root = parseRoot(output.body === undefined ? '' : await output.body.text(), 'RegionInfoList')

  const regionInfo: RegionInfo[] = []
  for (const node of childrenOf(root, 'RegionInfo')) regionInfo.push(readRegionInfo(node))

  return {
    status: common.status,
    statusCode: common.statusCode,
    requestId: common.requestId,
    headers: common.headers,
    regionInfo: regionInfo.length > 0 ? regionInfo : undefined,
  }
}

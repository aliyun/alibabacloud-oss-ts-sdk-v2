import { DeserializationError } from '../error/types.js'
import type { OperationInput, OperationOutput } from '../types.js'
import { toBase64 } from '../utils/base64.js'
import { utf8Encode } from '../utils/bytes.js'
import { md5 } from '../utils/md5.js'
import { createHeaderFields } from '../utils/header-fields.js'
import { copyInto } from '../utils/record.js'
import type { XmlNode } from '../xml/parse.js'
import { childOf, childrenOf, parseXml, textOf } from '../xml/parse.js'
import { buildXml } from '../xml/build.js'
import type {
  AccessControlList,
  BucketInfo,
  BucketPolicy,
  BucketStat,
  CommonPrefix,
  DeleteBucketRequest,
  DeleteBucketResult,
  GetBucketInfoRequest,
  GetBucketInfoResult,
  GetBucketLocationRequest,
  GetBucketLocationResult,
  GetBucketStatRequest,
  GetBucketStatResult,
  ListObjectsRequest,
  ListObjectsResult,
  ListObjectsV2Request,
  ListObjectsV2Result,
  ObjectProperties,
  Owner,
  PutBucketRequest,
  PutBucketResult,
  ServerSideEncryptionRule,
} from '../models/bucket-basic.js'
import {
  requireField,
  resultCommon,
  setBoolean,
  setDefaultContentMd5,
  setContentTypeIfAbsent,
  setHeaderString,
  setNumber,
  setString,
  toBoolean,
  toDate,
  toNumber,
} from './common.js'

export function serializeListObjectsV2(request: ListObjectsV2Request): OperationInput {
  const bucket = requireField(request.bucket, 'bucket')

  const headers = createHeaderFields(request.headers)
  setHeaderString(headers, 'x-oss-request-payer', request.requestPayer)
  setDefaultContentMd5(headers)

  // `request.parameters` overrides defaults; modelled fields override both.
  const parameters: Record<string, string> = { 'list-type': '2', 'encoding-type': 'url' }
  copyInto(parameters, request.parameters)
  setString(parameters, 'delimiter', request.delimiter)
  setString(parameters, 'start-after', request.startAfter)
  setString(parameters, 'continuation-token', request.continuationToken)
  setNumber(parameters, 'max-keys', request.maxKeys)
  setString(parameters, 'prefix', request.prefix)
  setString(parameters, 'encoding-type', request.encodingType)
  setBoolean(parameters, 'fetch-owner', request.fetchOwner)

  return {
    opName: 'ListObjectsV2',
    method: 'GET',
    bucket,
    headers,
    parameters,
  }
}

/** Decodes percent escapes without translating `+` to space. */
function urlDecode(value: string | undefined, decode: boolean): string | undefined {
  if (value === undefined || !decode) return value
  try {
    return decodeURIComponent(value)
  } catch (err) {
    throw new DeserializationError('cannot url-decode "' + value + '"', err instanceof Error ? err : undefined)
  }
}

function readOwner(node: XmlNode): Owner | undefined {
  const owner = childOf(node, 'Owner')
  if (owner === undefined) return undefined
  return { id: textOf(owner, 'ID'), displayName: textOf(owner, 'DisplayName') }
}

function readObjectProperties(node: XmlNode, decode: boolean): ObjectProperties {
  return {
    key: urlDecode(textOf(node, 'Key'), decode),
    type: textOf(node, 'Type'),
    size: toNumber(textOf(node, 'Size')),
    etag: textOf(node, 'ETag'),
    lastModified: toDate(textOf(node, 'LastModified')),
    storageClass: textOf(node, 'StorageClass'),
    owner: readOwner(node),
    restoreInfo: textOf(node, 'RestoreInfo'),
    transitionTime: toDate(textOf(node, 'TransitionTime')),
  }
}

/** Rejects a missing or unexpected `ListBucketResult` root. */
function parseListBucketResult(text: string): XmlNode {
  let root: XmlNode
  try {
    root = parseXml(text)
  } catch (err) {
    throw new DeserializationError('the response body is not XML', err instanceof Error ? err : undefined)
  }
  if (root.name !== 'ListBucketResult') {
    throw new DeserializationError('expected element type <ListBucketResult> but have <' + root.name + '>')
  }
  return root
}

export async function deserializeListObjectsV2(output: OperationOutput): Promise<ListObjectsV2Result> {
  const common = resultCommon(output)
  const root = parseListBucketResult(output.body === undefined ? '' : await output.body.text())

  // Decoding follows `EncodingType` in the response.
  const encodingType = textOf(root, 'EncodingType')
  const decode = encodingType !== undefined && encodingType.toLowerCase() === 'url'

  const contents: ObjectProperties[] = []
  for (const node of childrenOf(root, 'Contents')) {
    contents.push(readObjectProperties(node, decode))
  }

  const commonPrefixes: CommonPrefix[] = []
  for (const node of childrenOf(root, 'CommonPrefixes')) {
    commonPrefixes.push({ prefix: urlDecode(textOf(node, 'Prefix'), decode) })
  }

  return {
    status: common.status,
    statusCode: common.statusCode,
    requestId: common.requestId,
    headers: common.headers,
    name: textOf(root, 'Name'),
    prefix: urlDecode(textOf(root, 'Prefix'), decode),
    startAfter: urlDecode(textOf(root, 'StartAfter'), decode),
    maxKeys: toNumber(textOf(root, 'MaxKeys')),
    delimiter: urlDecode(textOf(root, 'Delimiter'), decode),
    isTruncated: toBoolean(textOf(root, 'IsTruncated')),
    continuationToken: urlDecode(textOf(root, 'ContinuationToken'), decode),
    nextContinuationToken: urlDecode(textOf(root, 'NextContinuationToken'), decode),
    encodingType,
    contents: contents.length > 0 ? contents : undefined,
    commonPrefixes: commonPrefixes.length > 0 ? commonPrefixes : undefined,
    keyCount: toNumber(textOf(root, 'KeyCount')),
  }
}

/** Returns the `PutBucket` body, or `undefined` when it has no elements. */
function createBucketConfigurationXml(request: PutBucketRequest): string | undefined {
  const config = request.createBucketConfiguration
  if (config === undefined) return undefined

  const children: XmlNode[] = []
  if (config.storageClass !== undefined) {
    children.push({ name: 'StorageClass', text: config.storageClass, children: [] })
  }
  if (config.dataRedundancyType !== undefined) {
    children.push({ name: 'DataRedundancyType', text: config.dataRedundancyType, children: [] })
  }
  if (children.length === 0) return undefined

  return buildXml({ name: 'CreateBucketConfiguration', text: '', children })
}

export function serializePutBucket(request: PutBucketRequest): OperationInput {
  const bucket = requireField(request.bucket, 'bucket')
  const body = createBucketConfigurationXml(request)

  const headers = createHeaderFields(request.headers)
  setHeaderString(headers, 'x-oss-acl', request.acl)
  setHeaderString(headers, 'x-oss-resource-group-id', request.resourceGroupId)
  setContentTypeIfAbsent(headers, 'application/xml')
  setDefaultContentMd5(headers, body === undefined ? undefined : toBase64(md5(utf8Encode(body))))

  const parameters: Record<string, string> = {}
  copyInto(parameters, request.parameters)

  return {
    opName: 'PutBucket',
    method: 'PUT',
    bucket,
    headers,
    parameters,
    body,
  }
}

export async function deserializePutBucket(output: OperationOutput): Promise<PutBucketResult> {
  const common = resultCommon(output)
  if (output.body !== undefined) await output.body.bytes()
  return common
}

export function serializeDeleteBucket(request: DeleteBucketRequest): OperationInput {
  const bucket = requireField(request.bucket, 'bucket')

  const headers = createHeaderFields(request.headers)
  setDefaultContentMd5(headers)

  const parameters: Record<string, string> = {}
  copyInto(parameters, request.parameters)

  return {
    opName: 'DeleteBucket',
    method: 'DELETE',
    bucket,
    headers,
    parameters,
  }
}

export async function deserializeDeleteBucket(output: OperationOutput): Promise<DeleteBucketResult> {
  const common = resultCommon(output)
  if (output.body !== undefined) await output.body.bytes()
  return common
}

export function serializeListObjects(request: ListObjectsRequest): OperationInput {
  const bucket = requireField(request.bucket, 'bucket')

  const headers = createHeaderFields(request.headers)
  setHeaderString(headers, 'x-oss-request-payer', request.requestPayer)
  setDefaultContentMd5(headers)

  const parameters: Record<string, string> = { 'encoding-type': 'url' }
  copyInto(parameters, request.parameters)
  setString(parameters, 'delimiter', request.delimiter)
  setString(parameters, 'marker', request.marker)
  setNumber(parameters, 'max-keys', request.maxKeys)
  setString(parameters, 'prefix', request.prefix)
  setString(parameters, 'encoding-type', request.encodingType)

  return { opName: 'ListObjects', method: 'GET', bucket, headers, parameters }
}

export async function deserializeListObjects(output: OperationOutput): Promise<ListObjectsResult> {
  const common = resultCommon(output)
  const root = parseListBucketResult(output.body === undefined ? '' : await output.body.text())

  const encodingType = textOf(root, 'EncodingType')
  const decode = encodingType !== undefined && encodingType.toLowerCase() === 'url'

  const contents: ObjectProperties[] = []
  for (const node of childrenOf(root, 'Contents')) contents.push(readObjectProperties(node, decode))

  const commonPrefixes: CommonPrefix[] = []
  for (const node of childrenOf(root, 'CommonPrefixes')) {
    commonPrefixes.push({ prefix: urlDecode(textOf(node, 'Prefix'), decode) })
  }

  return {
    status: common.status,
    statusCode: common.statusCode,
    requestId: common.requestId,
    headers: common.headers,
    name: textOf(root, 'Name'),
    prefix: urlDecode(textOf(root, 'Prefix'), decode),
    marker: urlDecode(textOf(root, 'Marker'), decode),
    maxKeys: toNumber(textOf(root, 'MaxKeys')),
    delimiter: urlDecode(textOf(root, 'Delimiter'), decode),
    isTruncated: toBoolean(textOf(root, 'IsTruncated')),
    nextMarker: urlDecode(textOf(root, 'NextMarker'), decode),
    encodingType,
    contents: contents.length > 0 ? contents : undefined,
    commonPrefixes: commonPrefixes.length > 0 ? commonPrefixes : undefined,
  }
}

/** Rejects a missing or unexpected root element. */
function parseNamedRoot(text: string, expected: string): XmlNode {
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

function serializeBucketSubResource(bucket: string | undefined, opName: string, subResource: string): OperationInput {
  const named = requireField(bucket, 'bucket')

  const headers = createHeaderFields()
  setDefaultContentMd5(headers)

  const parameters: Record<string, string> = {}
  parameters[subResource] = ''

  return { opName, method: 'GET', bucket: named, headers, parameters }
}

export function serializeGetBucketInfo(request: GetBucketInfoRequest): OperationInput {
  return serializeBucketSubResource(request.bucket, 'GetBucketInfo', 'bucketInfo')
}

function readAccessControlList(node: XmlNode): AccessControlList | undefined {
  const acl = childOf(node, 'AccessControlList')
  if (acl === undefined) return undefined
  return { grant: textOf(acl, 'Grant') }
}

function readServerSideEncryptionRule(node: XmlNode): ServerSideEncryptionRule | undefined {
  const rule = childOf(node, 'ServerSideEncryptionRule')
  if (rule === undefined) return undefined
  return {
    sseAlgorithm: textOf(rule, 'SSEAlgorithm'),
    kmsMasterKeyId: textOf(rule, 'KMSMasterKeyID'),
    kmsDataEncryption: textOf(rule, 'KMSDataEncryption'),
  }
}

function readBucketPolicy(node: XmlNode): BucketPolicy | undefined {
  const policy = childOf(node, 'BucketPolicy')
  if (policy === undefined) return undefined
  return { logBucket: textOf(policy, 'LogBucket'), logPrefix: textOf(policy, 'LogPrefix') }
}

function readBucketInfo(root: XmlNode): BucketInfo | undefined {
  const bucket = childOf(root, 'Bucket')
  if (bucket === undefined) return undefined
  return {
    location: textOf(bucket, 'Location'),
    name: textOf(bucket, 'Name'),
    storageClass: textOf(bucket, 'StorageClass'),
    dataRedundancyType: textOf(bucket, 'DataRedundancyType'),
    creationDate: textOf(bucket, 'CreationDate'),
    extranetEndpoint: textOf(bucket, 'ExtranetEndpoint'),
    intranetEndpoint: textOf(bucket, 'IntranetEndpoint'),
    comment: textOf(bucket, 'Comment'),
    owner: readOwner(bucket),
    transferAcceleration: textOf(bucket, 'TransferAcceleration'),
    accessMonitor: textOf(bucket, 'AccessMonitor'),
    resourceGroupId: textOf(bucket, 'ResourceGroupId'),
    accessControlList: readAccessControlList(bucket),
    blockPublicAccess: toBoolean(textOf(bucket, 'BlockPublicAccess')),
    crossRegionReplication: textOf(bucket, 'CrossRegionReplication'),
    serverSideEncryptionRule: readServerSideEncryptionRule(bucket),
    bucketPolicy: readBucketPolicy(bucket),
    versioning: textOf(bucket, 'Versioning'),
    bucketResourceType: textOf(bucket, 'BucketResourceType'),
    agenticBucketName: textOf(bucket, 'AgenticBucketName'),
  }
}

export async function deserializeGetBucketInfo(output: OperationOutput): Promise<GetBucketInfoResult> {
  const common = resultCommon(output)
  const root = parseNamedRoot(output.body === undefined ? '' : await output.body.text(), 'BucketInfo')
  return {
    status: common.status,
    statusCode: common.statusCode,
    requestId: common.requestId,
    headers: common.headers,
    bucketInfo: readBucketInfo(root),
  }
}

export function serializeGetBucketLocation(request: GetBucketLocationRequest): OperationInput {
  return serializeBucketSubResource(request.bucket, 'GetBucketLocation', 'location')
}

export async function deserializeGetBucketLocation(output: OperationOutput): Promise<GetBucketLocationResult> {
  const common = resultCommon(output)
  // The whole body is one `<LocationConstraint>` element whose text is the region.
  const root = parseNamedRoot(output.body === undefined ? '' : await output.body.text(), 'LocationConstraint')
  const location = root.text.trim()
  return {
    status: common.status,
    statusCode: common.statusCode,
    requestId: common.requestId,
    headers: common.headers,
    locationConstraint: location.length > 0 ? location : undefined,
  }
}

export function serializeGetBucketStat(request: GetBucketStatRequest): OperationInput {
  return serializeBucketSubResource(request.bucket, 'GetBucketStat', 'stat')
}

function readBucketStat(root: XmlNode): BucketStat {
  return {
    storage: toNumber(textOf(root, 'Storage')),
    objectCount: toNumber(textOf(root, 'ObjectCount')),
    multipartUploadCount: toNumber(textOf(root, 'MultipartUploadCount')),
    multipartPartCount: toNumber(textOf(root, 'MultipartPartCount')),
    liveChannelCount: toNumber(textOf(root, 'LiveChannelCount')),
    lastModifiedTime: toNumber(textOf(root, 'LastModifiedTime')),
    standardStorage: toNumber(textOf(root, 'StandardStorage')),
    standardObjectCount: toNumber(textOf(root, 'StandardObjectCount')),
    standardMultipartPartCount: toNumber(textOf(root, 'StandardMultipartPartCount')),
    standardMultipartPartStorage: toNumber(textOf(root, 'StandardMultipartPartStorage')),
    infrequentAccessStorage: toNumber(textOf(root, 'InfrequentAccessStorage')),
    infrequentAccessRealStorage: toNumber(textOf(root, 'InfrequentAccessRealStorage')),
    infrequentAccessObjectCount: toNumber(textOf(root, 'InfrequentAccessObjectCount')),
    infrequentMultipartPartCount: toNumber(textOf(root, 'InfrequentMultipartPartCount')),
    infrequentMultipartPartStorage: toNumber(textOf(root, 'InfrequentMultipartPartStorage')),
    archiveStorage: toNumber(textOf(root, 'ArchiveStorage')),
    archiveRealStorage: toNumber(textOf(root, 'ArchiveRealStorage')),
    archiveObjectCount: toNumber(textOf(root, 'ArchiveObjectCount')),
    archiveMultipartPartCount: toNumber(textOf(root, 'ArchiveMultipartPartCount')),
    archiveMultipartPartStorage: toNumber(textOf(root, 'ArchiveMultipartPartStorage')),
    coldArchiveStorage: toNumber(textOf(root, 'ColdArchiveStorage')),
    coldArchiveRealStorage: toNumber(textOf(root, 'ColdArchiveRealStorage')),
    coldArchiveObjectCount: toNumber(textOf(root, 'ColdArchiveObjectCount')),
    coldArchiveMultipartPartCount: toNumber(textOf(root, 'ColdArchiveMultipartPartCount')),
    coldArchiveMultipartPartStorage: toNumber(textOf(root, 'ColdArchiveMultipartPartStorage')),
    deepColdArchiveStorage: toNumber(textOf(root, 'DeepColdArchiveStorage')),
    deepColdArchiveRealStorage: toNumber(textOf(root, 'DeepColdArchiveRealStorage')),
    deepColdArchiveObjectCount: toNumber(textOf(root, 'DeepColdArchiveObjectCount')),
    deepColdArchiveMultipartPartCount: toNumber(textOf(root, 'DeepColdArchiveMultipartPartCount')),
    deepColdArchiveMultipartPartStorage: toNumber(textOf(root, 'DeepColdArchiveMultipartPartStorage')),
    deleteMarkerCount: toNumber(textOf(root, 'DeleteMarkerCount')),
    multipartPartStorage: toNumber(textOf(root, 'MultipartPartStorage')),
  }
}

export async function deserializeGetBucketStat(output: OperationOutput): Promise<GetBucketStatResult> {
  const common = resultCommon(output)
  const root = parseNamedRoot(output.body === undefined ? '' : await output.body.text(), 'BucketStat')
  return {
    status: common.status,
    statusCode: common.statusCode,
    requestId: common.requestId,
    headers: common.headers,
    bucketStat: readBucketStat(root),
  }
}

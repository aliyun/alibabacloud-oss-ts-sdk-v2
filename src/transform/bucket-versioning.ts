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
import type { CommonPrefix, Owner } from '../models/bucket-basic.js'
import type {
  DeleteMarkerEntry,
  GetBucketVersioningRequest,
  GetBucketVersioningResult,
  ListObjectVersionsRequest,
  ListObjectVersionsResult,
  ObjectVersion,
  PutBucketVersioningRequest,
  PutBucketVersioningResult,
  VersioningConfiguration,
} from '../models/bucket-versioning.js'
import {
  requireField,
  resultCommon,
  setDefaultContentMd5,
  setContentTypeIfAbsent,
  setNumber,
  setString,
  toBoolean,
  toDate,
  toNumber,
} from './common.js'

/** The `<VersioningConfiguration>` body, or `undefined` when the request carries no configuration. */
function versioningConfigurationXml(config: VersioningConfiguration | undefined): string | undefined {
  if (config === undefined) return undefined
  const children: XmlNode[] = []
  if (config.status !== undefined) children.push({ name: 'Status', text: config.status, children: [] })
  return buildXml({ name: 'VersioningConfiguration', text: '', children })
}

export function serializePutBucketVersioning(request: PutBucketVersioningRequest): OperationInput {
  const bucket = requireField(request.bucket, 'bucket')
  const body = versioningConfigurationXml(request.versioningConfiguration)

  const headers = createHeaderFields(request.headers)
  setContentTypeIfAbsent(headers, 'application/xml')
  setDefaultContentMd5(headers, body === undefined ? undefined : toBase64(md5(utf8Encode(body))))

  const parameters: Record<string, string> = { versioning: '' }
  copyInto(parameters, request.parameters)

  return { opName: 'PutBucketVersioning', method: 'PUT', bucket, headers, parameters, body }
}

export async function deserializePutBucketVersioning(output: OperationOutput): Promise<PutBucketVersioningResult> {
  const common = resultCommon(output)
  if (output.body !== undefined) await output.body.bytes()
  return common
}

export function serializeGetBucketVersioning(request: GetBucketVersioningRequest): OperationInput {
  const bucket = requireField(request.bucket, 'bucket')

  const headers = createHeaderFields(request.headers)
  setDefaultContentMd5(headers)

  const parameters: Record<string, string> = { versioning: '' }
  copyInto(parameters, request.parameters)

  return { opName: 'GetBucketVersioning', method: 'GET', bucket, headers, parameters }
}

/** A missing or foreign root is an error, not an empty result: a 200 whose body is not this element means something else answered. */
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

export async function deserializeGetBucketVersioning(output: OperationOutput): Promise<GetBucketVersioningResult> {
  const common = resultCommon(output)
  const root = parseNamedRoot(output.body === undefined ? '' : await output.body.text(), 'VersioningConfiguration')
  return {
    status: common.status,
    statusCode: common.statusCode,
    requestId: common.requestId,
    headers: common.headers,
    versioningConfiguration: { status: textOf(root, 'Status') },
  }
}

export function serializeListObjectVersions(request: ListObjectVersionsRequest): OperationInput {
  const bucket = requireField(request.bucket, 'bucket')

  const headers = createHeaderFields(request.headers)
  setDefaultContentMd5(headers)

  const parameters: Record<string, string> = { versions: '', 'encoding-type': 'url' }
  copyInto(parameters, request.parameters)
  setString(parameters, 'delimiter', request.delimiter)
  setString(parameters, 'key-marker', request.keyMarker)
  setString(parameters, 'version-id-marker', request.versionIdMarker)
  setNumber(parameters, 'max-keys', request.maxKeys)
  setString(parameters, 'prefix', request.prefix)
  setString(parameters, 'encoding-type', request.encodingType)

  return { opName: 'ListObjectVersions', method: 'GET', bucket, headers, parameters }
}

/**
 * `decodeURIComponent`, not a form decoder: it leaves a literal `+` alone, where a form decoder
 * would turn a key containing one into a key containing a space.
 */
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

// The version ID is left as sent: it is not a key and carries no bytes url-encoding would touch.
function readObjectVersion(node: XmlNode, decode: boolean): ObjectVersion {
  return {
    key: urlDecode(textOf(node, 'Key'), decode),
    versionId: textOf(node, 'VersionId'),
    isLatest: toBoolean(textOf(node, 'IsLatest')),
    lastModified: toDate(textOf(node, 'LastModified')),
    etag: textOf(node, 'ETag'),
    size: toNumber(textOf(node, 'Size')),
    storageClass: textOf(node, 'StorageClass'),
    owner: readOwner(node),
    restoreInfo: textOf(node, 'RestoreInfo'),
  }
}

function readDeleteMarker(node: XmlNode, decode: boolean): DeleteMarkerEntry {
  return {
    key: urlDecode(textOf(node, 'Key'), decode),
    versionId: textOf(node, 'VersionId'),
    isLatest: toBoolean(textOf(node, 'IsLatest')),
    lastModified: toDate(textOf(node, 'LastModified')),
    owner: readOwner(node),
  }
}

export async function deserializeListObjectVersions(output: OperationOutput): Promise<ListObjectVersionsResult> {
  const common = resultCommon(output)
  const root = parseNamedRoot(output.body === undefined ? '' : await output.body.text(), 'ListVersionsResult')

  const encodingType = textOf(root, 'EncodingType')
  const decode = encodingType !== undefined && encodingType.toLowerCase() === 'url'

  const versions: ObjectVersion[] = []
  for (const node of childrenOf(root, 'Version')) versions.push(readObjectVersion(node, decode))

  const deleteMarkers: DeleteMarkerEntry[] = []
  for (const node of childrenOf(root, 'DeleteMarker')) deleteMarkers.push(readDeleteMarker(node, decode))

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
    keyMarker: urlDecode(textOf(root, 'KeyMarker'), decode),
    versionIdMarker: textOf(root, 'VersionIdMarker'),
    nextKeyMarker: urlDecode(textOf(root, 'NextKeyMarker'), decode),
    nextVersionIdMarker: textOf(root, 'NextVersionIdMarker'),
    maxKeys: toNumber(textOf(root, 'MaxKeys')),
    delimiter: urlDecode(textOf(root, 'Delimiter'), decode),
    isTruncated: toBoolean(textOf(root, 'IsTruncated')),
    encodingType,
    versions: versions.length > 0 ? versions : undefined,
    deleteMarkers: deleteMarkers.length > 0 ? deleteMarkers : undefined,
    commonPrefixes: commonPrefixes.length > 0 ? commonPrefixes : undefined,
  }
}

import { DeserializationError } from '../error/types.js'
import type { HeaderFields } from '../transport/types.js'
import type { OperationInput, OperationOutput } from '../types.js'
import { toBase64 } from '../utils/base64.js'
import { utf8Encode } from '../utils/bytes.js'
import { md5 } from '../utils/md5.js'
import { createHeaderFields } from '../utils/header-fields.js'
import { copyInto } from '../utils/record.js'
import { escapeUriComponent } from '../utils/uri.js'
import type { XmlNode } from '../xml/parse.js'
import { childrenOf, parseXml, textOf } from '../xml/parse.js'
import { buildXml, escapeXmlKey } from '../xml/build.js'
import {
  applyUserMetadata,
  requireField,
  resultCommon,
  setContentTypeIfAbsent,
  setDefaultContentMd5,
  setHeaderBoolean,
  setHeaderNumber,
  setHeaderString,
  setNumber,
  setString,
  toBoolean,
  toDate,
  toNumber,
  userMetadata,
} from './common.js'
import type {
  AppendObjectRequest,
  AppendObjectResult,
  CleanRestoredObjectRequest,
  CleanRestoredObjectResult,
  CopyObjectRequest,
  CopyObjectResult,
  DeleteMultipleObjectsRequest,
  DeleteMultipleObjectsResult,
  DeleteObjectRequest,
  DeleteObjectResult,
  DeletedObject,
  GetObjectMetaRequest,
  GetObjectMetaResult,
  GetObjectRequest,
  GetObjectResult,
  HeadObjectRequest,
  HeadObjectResult,
  ObjectIdentifier,
  ObjectMeta,
  PutObjectRequest,
  PutObjectResult,
  RestoreObjectRequest,
  RestoreObjectResult,
  RestoreRequest,
} from '../models/object-basic.js'

/** Serializes a presigned upload without adding a default `Content-Type`. */
export function serializePutObjectPresign(request: PutObjectRequest): OperationInput {
  const bucket = requireField(request.bucket, 'bucket')
  const key = requireField(request.key, 'key')

  const headers = createHeaderFields(request.headers)
  setHeaderString(headers, 'Cache-Control', request.cacheControl)
  setHeaderString(headers, 'Content-Disposition', request.contentDisposition)
  setHeaderString(headers, 'Content-Encoding', request.contentEncoding)
  setHeaderNumber(headers, 'Content-Length', request.contentLength)
  setHeaderString(headers, 'Content-MD5', request.contentMd5)
  setHeaderString(headers, 'Content-Type', request.contentType)
  setHeaderString(headers, 'Expires', request.expires)
  setHeaderBoolean(headers, 'x-oss-forbid-overwrite', request.forbidOverwrite)
  setHeaderString(headers, 'x-oss-object-acl', request.acl)
  setHeaderString(headers, 'x-oss-storage-class', request.storageClass)
  setHeaderString(headers, 'x-oss-tagging', request.tagging)
  setHeaderNumber(headers, 'x-oss-traffic-limit', request.trafficLimit)
  setHeaderString(headers, 'x-oss-request-payer', request.requestPayer)
  setHeaderString(headers, 'x-oss-callback', request.callback)
  setHeaderString(headers, 'x-oss-callback-var', request.callbackVar)
  applyUserMetadata(headers, request.metadata)

  const parameters: Record<string, string> = {}
  copyInto(parameters, request.parameters)

  return {
    opName: 'PutObject',
    method: 'PUT',
    bucket,
    key,
    headers,
    parameters,
    body: request.body,
  }
}

export function serializePutObject(request: PutObjectRequest): OperationInput {
  const operation = serializePutObjectPresign(request)
  // Marks sent uploads for Content-Type detection when absent.
  if ((operation.headers as HeaderFields).get('content-type') === undefined) {
    operation.opMetadata = { detect_content_type: true }
  }
  return operation
}

export async function deserializePutObject(output: OperationOutput): Promise<PutObjectResult> {
  const common = resultCommon(output)
  const headers = common.headers
  const text = output.body !== undefined ? await output.body.text() : ''
  return {
    status: common.status,
    statusCode: common.statusCode,
    requestId: common.requestId,
    headers,
    contentMd5: headers['content-md5'],
    etag: headers['etag'],
    hashCrc64ecma: headers['x-oss-hash-crc64ecma'],
    versionId: headers['x-oss-version-id'],
    callbackResult: text.length > 0 ? text : undefined,
  }
}

function deserializeObjectMeta(headers: Record<string, string>): ObjectMeta {
  return {
    contentLength: toNumber(headers['content-length']),
    contentType: headers['content-type'],
    contentMd5: headers['content-md5'],
    etag: headers['etag'],
    lastModified: toDate(headers['last-modified']),
    cacheControl: headers['cache-control'],
    contentDisposition: headers['content-disposition'],
    contentEncoding: headers['content-encoding'],
    expires: headers['expires'],
    objectType: headers['x-oss-object-type'],
    storageClass: headers['x-oss-storage-class'],
    hashCrc64ecma: headers['x-oss-hash-crc64ecma'],
    versionId: headers['x-oss-version-id'],
    taggingCount: toNumber(headers['x-oss-tagging-count']),
    expiration: headers['x-oss-expiration'],
    restore: headers['x-oss-restore'],
    metadata: userMetadata(headers),
  }
}

/** Copies the shared object metadata onto a head or get result. */
function copyMeta(target: ObjectMeta, meta: ObjectMeta): void {
  target.contentLength = meta.contentLength
  target.contentType = meta.contentType
  target.contentMd5 = meta.contentMd5
  target.etag = meta.etag
  target.lastModified = meta.lastModified
  target.cacheControl = meta.cacheControl
  target.contentDisposition = meta.contentDisposition
  target.contentEncoding = meta.contentEncoding
  target.expires = meta.expires
  target.objectType = meta.objectType
  target.storageClass = meta.storageClass
  target.hashCrc64ecma = meta.hashCrc64ecma
  target.versionId = meta.versionId
  target.taggingCount = meta.taggingCount
  target.expiration = meta.expiration
  target.restore = meta.restore
  target.metadata = meta.metadata
}

export function serializeGetObject(request: GetObjectRequest): OperationInput {
  const bucket = requireField(request.bucket, 'bucket')
  const key = requireField(request.key, 'key')

  const headers = createHeaderFields(request.headers)
  setHeaderString(headers, 'If-Match', request.ifMatch)
  setHeaderString(headers, 'If-None-Match', request.ifNoneMatch)
  setHeaderString(headers, 'If-Modified-Since', request.ifModifiedSince)
  setHeaderString(headers, 'If-Unmodified-Since', request.ifUnmodifiedSince)
  setHeaderString(headers, 'Range', request.range)
  setHeaderString(headers, 'x-oss-range-behavior', request.rangeBehavior)
  setHeaderNumber(headers, 'x-oss-traffic-limit', request.trafficLimit)
  setHeaderString(headers, 'x-oss-request-payer', request.requestPayer)

  const parameters: Record<string, string> = {}
  copyInto(parameters, request.parameters)
  setString(parameters, 'versionId', request.versionId)
  setString(parameters, 'x-oss-process', request.process)
  setString(parameters, 'response-cache-control', request.responseCacheControl)
  setString(parameters, 'response-content-disposition', request.responseContentDisposition)
  setString(parameters, 'response-content-encoding', request.responseContentEncoding)
  setString(parameters, 'response-content-language', request.responseContentLanguage)
  setString(parameters, 'response-content-type', request.responseContentType)
  setString(parameters, 'response-expires', request.responseExpires)

  return {
    opName: 'GetObject',
    method: 'GET',
    bucket,
    key,
    headers,
    parameters,
    opMetadata: { 'response-stream': true },
  }
}

export function deserializeGetObject(output: OperationOutput): GetObjectResult {
  const common = resultCommon(output)
  const headers = common.headers
  const result: GetObjectResult = {
    status: common.status,
    statusCode: common.statusCode,
    requestId: common.requestId,
    headers,
    body: output.body,
    contentRange: headers['content-range'],
    deleteMarker: toBoolean(headers['x-oss-delete-marker']),
  }
  copyMeta(result, deserializeObjectMeta(headers))
  return result
}

export function serializeHeadObject(request: HeadObjectRequest): OperationInput {
  const bucket = requireField(request.bucket, 'bucket')
  const key = requireField(request.key, 'key')

  const headers = createHeaderFields(request.headers)
  setHeaderString(headers, 'If-Match', request.ifMatch)
  setHeaderString(headers, 'If-None-Match', request.ifNoneMatch)
  setHeaderString(headers, 'If-Modified-Since', request.ifModifiedSince)
  setHeaderString(headers, 'If-Unmodified-Since', request.ifUnmodifiedSince)
  setHeaderString(headers, 'x-oss-request-payer', request.requestPayer)

  const parameters: Record<string, string> = {}
  copyInto(parameters, request.parameters)
  setString(parameters, 'versionId', request.versionId)

  return {
    opName: 'HeadObject',
    method: 'HEAD',
    bucket,
    key,
    headers,
    parameters,
  }
}

export async function deserializeHeadObject(output: OperationOutput): Promise<HeadObjectResult> {
  const common = resultCommon(output)
  const headers = common.headers
  if (output.body !== undefined) await output.body.bytes()
  const result: HeadObjectResult = {
    status: common.status,
    statusCode: common.statusCode,
    requestId: common.requestId,
    headers,
  }
  copyMeta(result, deserializeObjectMeta(headers))
  return result
}

export function serializeDeleteObject(request: DeleteObjectRequest): OperationInput {
  const bucket = requireField(request.bucket, 'bucket')
  const key = requireField(request.key, 'key')

  const headers = createHeaderFields(request.headers)
  setHeaderString(headers, 'x-oss-request-payer', request.requestPayer)
  setDefaultContentMd5(headers)

  const parameters: Record<string, string> = {}
  copyInto(parameters, request.parameters)
  setString(parameters, 'versionId', request.versionId)

  return {
    opName: 'DeleteObject',
    method: 'DELETE',
    bucket,
    key,
    headers,
    parameters,
  }
}

export async function deserializeDeleteObject(output: OperationOutput): Promise<DeleteObjectResult> {
  const common = resultCommon(output)
  const headers = common.headers
  if (output.body !== undefined) await output.body.bytes()
  return {
    status: common.status,
    statusCode: common.statusCode,
    requestId: common.requestId,
    headers,
    versionId: headers['x-oss-version-id'],
    deleteMarker: toBoolean(headers['x-oss-delete-marker']),
  }
}

export function serializeCopyObject(request: CopyObjectRequest): OperationInput {
  const bucket = requireField(request.bucket, 'bucket')
  const key = requireField(request.key, 'key')
  const sourceKey = requireField(request.sourceKey, 'sourceKey')

  const headers = createHeaderFields(request.headers)
  // Source-key slashes are encoded as part of one path segment.
  let source = '/' + (request.sourceBucket ?? bucket) + '/' + escapeUriComponent(sourceKey)
  if (request.sourceVersionId !== undefined) source += '?versionId=' + request.sourceVersionId
  setHeaderString(headers, 'x-oss-copy-source', source)
  setHeaderBoolean(headers, 'x-oss-forbid-overwrite', request.forbidOverwrite)
  setHeaderString(headers, 'x-oss-copy-source-if-match', request.copySourceIfMatch)
  setHeaderString(headers, 'x-oss-copy-source-if-none-match', request.copySourceIfNoneMatch)
  setHeaderString(headers, 'x-oss-copy-source-if-modified-since', request.copySourceIfModifiedSince)
  setHeaderString(headers, 'x-oss-copy-source-if-unmodified-since', request.copySourceIfUnmodifiedSince)
  setHeaderString(headers, 'x-oss-metadata-directive', request.metadataDirective)
  setHeaderString(headers, 'x-oss-server-side-encryption', request.serverSideEncryption)
  setHeaderString(headers, 'x-oss-server-side-data-encryption', request.serverSideDataEncryption)
  setHeaderString(headers, 'x-oss-server-side-encryption-key-id', request.serverSideEncryptionKeyId)
  setHeaderString(headers, 'x-oss-object-acl', request.acl)
  setHeaderString(headers, 'x-oss-storage-class', request.storageClass)
  setHeaderString(headers, 'x-oss-tagging', request.tagging)
  setHeaderString(headers, 'x-oss-tagging-directive', request.taggingDirective)
  setHeaderString(headers, 'x-oss-request-payer', request.requestPayer)
  applyUserMetadata(headers, request.metadata)
  setDefaultContentMd5(headers)

  const parameters: Record<string, string> = {}
  copyInto(parameters, request.parameters)

  return { opName: 'CopyObject', method: 'PUT', bucket, key, headers, parameters }
}

export async function deserializeCopyObject(output: OperationOutput): Promise<CopyObjectResult> {
  const common = resultCommon(output)
  const headers = common.headers
  const text = output.body === undefined ? '' : await output.body.text()
  let lastModified: Date | undefined
  let etag: string | undefined
  if (text.length > 0) {
    let root: XmlNode
    try {
      root = parseXml(text)
    } catch (err) {
      throw new DeserializationError('the response body is not XML', err instanceof Error ? err : undefined)
    }
    if (root.name !== 'CopyObjectResult') {
      throw new DeserializationError('expected element type <CopyObjectResult> but have <' + root.name + '>')
    }
    lastModified = toDate(textOf(root, 'LastModified'))
    etag = textOf(root, 'ETag')
  }
  return {
    status: common.status,
    statusCode: common.statusCode,
    requestId: common.requestId,
    headers,
    lastModified,
    etag,
    copySourceVersionId: headers['x-oss-copy-source-version-id'],
    versionId: headers['x-oss-version-id'],
  }
}

export function serializeAppendObject(request: AppendObjectRequest): OperationInput {
  const bucket = requireField(request.bucket, 'bucket')
  const key = requireField(request.key, 'key')

  const headers = createHeaderFields(request.headers)
  setHeaderString(headers, 'Content-Type', request.contentType)
  setHeaderString(headers, 'Cache-Control', request.cacheControl)
  setHeaderString(headers, 'Content-Disposition', request.contentDisposition)
  setHeaderString(headers, 'Content-Encoding', request.contentEncoding)
  setHeaderString(headers, 'Content-MD5', request.contentMd5)
  setHeaderString(headers, 'Expires', request.expires)
  setHeaderString(headers, 'x-oss-object-acl', request.acl)
  setHeaderString(headers, 'x-oss-server-side-encryption', request.serverSideEncryption)
  setHeaderString(headers, 'x-oss-storage-class', request.storageClass)
  setHeaderString(headers, 'x-oss-request-payer', request.requestPayer)
  applyUserMetadata(headers, request.metadata)

  const parameters: Record<string, string> = { append: '' }
  copyInto(parameters, request.parameters)
  setNumber(parameters, 'position', request.position)

  const opMetadata = headers.get('content-type') === undefined ? { detect_content_type: true } : undefined
  return { opName: 'AppendObject', method: 'POST', bucket, key, headers, parameters, body: request.body, opMetadata }
}

export async function deserializeAppendObject(output: OperationOutput): Promise<AppendObjectResult> {
  const common = resultCommon(output)
  const headers = common.headers
  if (output.body !== undefined) await output.body.bytes()
  return {
    status: common.status,
    statusCode: common.statusCode,
    requestId: common.requestId,
    headers,
    nextAppendPosition: toNumber(headers['x-oss-next-append-position']),
    hashCrc64ecma: headers['x-oss-hash-crc64ecma'],
    versionId: headers['x-oss-version-id'],
  }
}

function deleteBodyXml(objects: ObjectIdentifier[], quiet: boolean | undefined): string {
  let body = '<?xml version="1.0" encoding="UTF-8"?><Delete>'
  if (quiet !== undefined) body += '<Quiet>' + String(quiet) + '</Quiet>'
  for (const object of objects) {
    body += '<Object><Key>' + escapeXmlKey(object.key) + '</Key>'
    if (object.versionId !== undefined) body += '<VersionId>' + object.versionId + '</VersionId>'
    body += '</Object>'
  }
  return body + '</Delete>'
}

export function serializeDeleteMultipleObjects(request: DeleteMultipleObjectsRequest): OperationInput {
  const bucket = requireField(request.bucket, 'bucket')
  const objects = requireField(request.objects, 'objects')
  const body = deleteBodyXml(objects, request.quiet)

  const headers = createHeaderFields(request.headers)
  setHeaderString(headers, 'x-oss-request-payer', request.requestPayer)
  setContentTypeIfAbsent(headers, 'application/xml')
  setDefaultContentMd5(headers, toBase64(md5(utf8Encode(body))))

  const parameters: Record<string, string> = { delete: '', 'encoding-type': 'url' }
  copyInto(parameters, request.parameters)

  return { opName: 'DeleteMultipleObjects', method: 'POST', bucket, headers, parameters, body }
}

function decodeKey(value: string | undefined, decode: boolean): string | undefined {
  if (value === undefined || !decode) return value
  try {
    return decodeURIComponent(value)
  } catch (err) {
    throw new DeserializationError('cannot url-decode "' + value + '"', err instanceof Error ? err : undefined)
  }
}

export async function deserializeDeleteMultipleObjects(
  output: OperationOutput,
): Promise<DeleteMultipleObjectsResult> {
  const common = resultCommon(output)
  const text = output.body === undefined ? '' : await output.body.text()
  let root: XmlNode
  try {
    root = parseXml(text)
  } catch (err) {
    throw new DeserializationError('the response body is not XML', err instanceof Error ? err : undefined)
  }
  if (root.name !== 'DeleteResult') {
    throw new DeserializationError('expected element type <DeleteResult> but have <' + root.name + '>')
  }
  const encodingType = textOf(root, 'EncodingType')
  const decode = encodingType !== undefined && encodingType.toLowerCase() === 'url'
  const deleted: DeletedObject[] = []
  for (const node of childrenOf(root, 'Deleted')) {
    deleted.push({
      key: decodeKey(textOf(node, 'Key'), decode),
      versionId: textOf(node, 'VersionId'),
      deleteMarker: toBoolean(textOf(node, 'DeleteMarker')),
      deleteMarkerVersionId: textOf(node, 'DeleteMarkerVersionId'),
    })
  }
  return {
    status: common.status,
    statusCode: common.statusCode,
    requestId: common.requestId,
    headers: common.headers,
    deleted: deleted.length > 0 ? deleted : undefined,
    encodingType,
  }
}

export function serializeGetObjectMeta(request: GetObjectMetaRequest): OperationInput {
  const bucket = requireField(request.bucket, 'bucket')
  const key = requireField(request.key, 'key')

  const headers = createHeaderFields(request.headers)
  setHeaderString(headers, 'x-oss-request-payer', request.requestPayer)
  setDefaultContentMd5(headers)

  const parameters: Record<string, string> = { objectMeta: '' }
  copyInto(parameters, request.parameters)
  setString(parameters, 'versionId', request.versionId)

  return { opName: 'GetObjectMeta', method: 'HEAD', bucket, key, headers, parameters }
}

export async function deserializeGetObjectMeta(output: OperationOutput): Promise<GetObjectMetaResult> {
  const common = resultCommon(output)
  const headers = common.headers
  if (output.body !== undefined) await output.body.bytes()
  return {
    status: common.status,
    statusCode: common.statusCode,
    requestId: common.requestId,
    headers,
    contentLength: toNumber(headers['content-length']),
    etag: headers['etag'],
    lastModified: toDate(headers['last-modified']),
    lastAccessTime: headers['x-oss-last-access-time'],
    transitionTime: headers['x-oss-transition-time'],
    versionId: headers['x-oss-version-id'],
  }
}

function restoreRequestXml(restore: RestoreRequest): string {
  const children: XmlNode[] = []
  if (restore.days !== undefined) children.push({ name: 'Days', text: String(restore.days), children: [] })
  if (restore.jobParameters !== undefined) {
    const params: XmlNode[] = []
    if (restore.jobParameters.tier !== undefined) {
      params.push({ name: 'Tier', text: restore.jobParameters.tier, children: [] })
    }
    children.push({ name: 'JobParameters', text: '', children: params })
  }
  return buildXml({ name: 'RestoreRequest', text: '', children })
}

export function serializeRestoreObject(request: RestoreObjectRequest): OperationInput {
  const bucket = requireField(request.bucket, 'bucket')
  const key = requireField(request.key, 'key')
  const body = request.restoreRequest === undefined ? undefined : restoreRequestXml(request.restoreRequest)

  const headers = createHeaderFields(request.headers)
  setHeaderString(headers, 'x-oss-request-payer', request.requestPayer)
  setContentTypeIfAbsent(headers, 'application/xml')
  setDefaultContentMd5(headers, body === undefined ? undefined : toBase64(md5(utf8Encode(body))))

  const parameters: Record<string, string> = { restore: '' }
  copyInto(parameters, request.parameters)
  setString(parameters, 'versionId', request.versionId)

  return { opName: 'RestoreObject', method: 'POST', bucket, key, headers, parameters, body }
}

export async function deserializeRestoreObject(output: OperationOutput): Promise<RestoreObjectResult> {
  const common = resultCommon(output)
  const headers = common.headers
  if (output.body !== undefined) await output.body.bytes()
  return {
    status: common.status,
    statusCode: common.statusCode,
    requestId: common.requestId,
    headers,
    objectRestorePriority: headers['x-oss-object-restore-priority'],
    versionId: headers['x-oss-version-id'],
  }
}

export function serializeCleanRestoredObject(request: CleanRestoredObjectRequest): OperationInput {
  const bucket = requireField(request.bucket, 'bucket')
  const key = requireField(request.key, 'key')

  const headers = createHeaderFields(request.headers)
  setHeaderString(headers, 'x-oss-request-payer', request.requestPayer)
  setContentTypeIfAbsent(headers, 'application/xml')
  setDefaultContentMd5(headers)

  const parameters: Record<string, string> = { cleanRestoredObject: '' }
  copyInto(parameters, request.parameters)

  return { opName: 'CleanRestoredObject', method: 'POST', bucket, key, headers, parameters }
}

export async function deserializeCleanRestoredObject(
  output: OperationOutput,
): Promise<CleanRestoredObjectResult> {
  const common = resultCommon(output)
  if (output.body !== undefined) await output.body.bytes()
  return common
}

import { DeserializationError } from '../error/types.js'
import type { OperationInput, OperationOutput } from '../types.js'
import { toBase64 } from '../utils/base64.js'
import { utf8Encode } from '../utils/bytes.js'
import { md5 } from '../utils/md5.js'
import { createHeaderFields } from '../utils/header-fields.js'
import { copyInto } from '../utils/record.js'
import { escapeUriComponent } from '../utils/uri.js'
import type { XmlNode } from '../xml/parse.js'
import { childrenOf, parseXml, textOf } from '../xml/parse.js'
import { buildXml } from '../xml/build.js'
import type {
  AbortMultipartUploadRequest,
  AbortMultipartUploadResult,
  CompleteMultipartUploadRequest,
  CompleteMultipartUploadResult,
  InitiateMultipartUploadRequest,
  InitiateMultipartUploadResult,
  ListMultipartUploadsRequest,
  ListMultipartUploadsResult,
  ListPartsRequest,
  ListPartsResult,
  Part,
  Upload,
  UploadPartCopyRequest,
  UploadPartCopyResult,
  UploadPartRequest,
  UploadPartResult,
} from '../models/object-multipart.js'
import {
  applyUserMetadata,
  requireField,
  resultCommon,
  setContentTypeIfAbsent,
  setDefaultContentMd5,
  setHeaderBoolean,
  setHeaderString,
  setNumber,
  setString,
  toBoolean,
  toDate,
  toNumber,
} from './common.js'

/** URL-decodes a value and reports malformed escapes as deserialization errors. */
function urlDecode(value: string | undefined, decode: boolean): string | undefined {
  if (value === undefined || !decode) return value
  try {
    return decodeURIComponent(value)
  } catch (err) {
    throw new DeserializationError('cannot url-decode "' + value + '"', err instanceof Error ? err : undefined)
  }
}

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

export function serializeInitiateMultipartUpload(request: InitiateMultipartUploadRequest): OperationInput {
  const bucket = requireField(request.bucket, 'bucket')
  const key = requireField(request.key, 'key')

  const headers = createHeaderFields(request.headers)
  setHeaderBoolean(headers, 'x-oss-forbid-overwrite', request.forbidOverwrite)
  setHeaderString(headers, 'x-oss-storage-class', request.storageClass)
  setHeaderString(headers, 'x-oss-tagging', request.tagging)
  setHeaderString(headers, 'x-oss-server-side-encryption', request.serverSideEncryption)
  setHeaderString(headers, 'x-oss-server-side-data-encryption', request.serverSideDataEncryption)
  setHeaderString(headers, 'x-oss-server-side-encryption-key-id', request.serverSideEncryptionKeyId)
  setHeaderString(headers, 'Cache-Control', request.cacheControl)
  setHeaderString(headers, 'Content-Disposition', request.contentDisposition)
  setHeaderString(headers, 'Content-Encoding', request.contentEncoding)
  setHeaderString(headers, 'Content-Type', request.contentType)
  setHeaderString(headers, 'Expires', request.expires)
  applyUserMetadata(headers, request.metadata)
  setDefaultContentMd5(headers)

  const parameters: Record<string, string> = { uploads: '', 'encoding-type': 'url' }
  copyInto(parameters, request.parameters)
  setString(parameters, 'encoding-type', request.encodingType)

  const opMetadata = headers.get('content-type') === undefined ? { detect_content_type: true } : undefined
  return { opName: 'InitiateMultipartUpload', method: 'POST', bucket, key, headers, parameters, opMetadata }
}

export async function deserializeInitiateMultipartUpload(
  output: OperationOutput,
): Promise<InitiateMultipartUploadResult> {
  const common = resultCommon(output)
  const root = parseNamedRoot(output.body === undefined ? '' : await output.body.text(), 'InitiateMultipartUploadResult')
  const encodingType = textOf(root, 'EncodingType')
  const decode = encodingType !== undefined && encodingType.toLowerCase() === 'url'
  return {
    status: common.status,
    statusCode: common.statusCode,
    requestId: common.requestId,
    headers: common.headers,
    bucket: textOf(root, 'Bucket'),
    key: urlDecode(textOf(root, 'Key'), decode),
    uploadId: textOf(root, 'UploadId'),
    encodingType,
  }
}

export function serializeUploadPart(request: UploadPartRequest): OperationInput {
  const bucket = requireField(request.bucket, 'bucket')
  const key = requireField(request.key, 'key')
  const uploadId = requireField(request.uploadId, 'uploadId')
  const partNumber = requireField(request.partNumber, 'partNumber')

  const headers = createHeaderFields(request.headers)

  const parameters: Record<string, string> = {}
  copyInto(parameters, request.parameters)
  setNumber(parameters, 'partNumber', partNumber)
  setString(parameters, 'uploadId', uploadId)

  return { opName: 'UploadPart', method: 'PUT', bucket, key, headers, parameters, body: request.body }
}

export async function deserializeUploadPart(output: OperationOutput): Promise<UploadPartResult> {
  const common = resultCommon(output)
  const headers = common.headers
  if (output.body !== undefined) await output.body.bytes()
  return {
    status: common.status,
    statusCode: common.statusCode,
    requestId: common.requestId,
    headers,
    etag: headers['etag'],
    hashCrc64ecma: headers['x-oss-hash-crc64ecma'],
  }
}

function completeBodyXml(parts: Part[]): string {
  const nodes: XmlNode[] = []
  for (const part of parts) {
    const fields: XmlNode[] = []
    if (part.etag !== undefined) fields.push({ name: 'ETag', text: part.etag, children: [] })
    if (part.partNumber !== undefined) {
      fields.push({ name: 'PartNumber', text: String(part.partNumber), children: [] })
    }
    nodes.push({ name: 'Part', text: '', children: fields })
  }
  return buildXml({ name: 'CompleteMultipartUpload', text: '', children: nodes })
}

export function serializeCompleteMultipartUpload(request: CompleteMultipartUploadRequest): OperationInput {
  const bucket = requireField(request.bucket, 'bucket')
  const key = requireField(request.key, 'key')
  const uploadId = requireField(request.uploadId, 'uploadId')
  const body = request.parts === undefined ? undefined : completeBodyXml(request.parts)

  const headers = createHeaderFields(request.headers)
  setHeaderBoolean(headers, 'x-oss-forbid-overwrite', request.forbidOverwrite)
  setHeaderString(headers, 'x-oss-complete-all', request.completeAll)
  setHeaderString(headers, 'x-oss-callback', request.callback)
  setHeaderString(headers, 'x-oss-callback-var', request.callbackVar)
  setContentTypeIfAbsent(headers, 'application/xml')
  setDefaultContentMd5(headers, body === undefined ? undefined : toBase64(md5(utf8Encode(body))))

  const parameters: Record<string, string> = { 'encoding-type': 'url' }
  copyInto(parameters, request.parameters)
  setString(parameters, 'uploadId', uploadId)
  setString(parameters, 'encoding-type', request.encodingType)

  return { opName: 'CompleteMultipartUpload', method: 'POST', bucket, key, headers, parameters, body }
}

export async function deserializeCompleteMultipartUpload(
  output: OperationOutput,
  hasCallback: boolean,
): Promise<CompleteMultipartUploadResult> {
  const common = resultCommon(output)
  const headers = common.headers
  const text = output.body === undefined ? '' : await output.body.text()
  // A callback response is returned verbatim without the Complete XML fields.
  if (hasCallback) {
    return {
      status: common.status,
      statusCode: common.statusCode,
      requestId: common.requestId,
      headers,
      versionId: headers['x-oss-version-id'],
      hashCrc64ecma: headers['x-oss-hash-crc64ecma'],
      callbackResult: text.length > 0 ? text : undefined,
    }
  }
  const root = parseNamedRoot(text, 'CompleteMultipartUploadResult')
  const encodingType = textOf(root, 'EncodingType')
  const decode = encodingType !== undefined && encodingType.toLowerCase() === 'url'
  return {
    status: common.status,
    statusCode: common.statusCode,
    requestId: common.requestId,
    headers,
    location: textOf(root, 'Location'),
    bucket: textOf(root, 'Bucket'),
    key: urlDecode(textOf(root, 'Key'), decode),
    etag: textOf(root, 'ETag'),
    encodingType,
    versionId: headers['x-oss-version-id'],
    hashCrc64ecma: headers['x-oss-hash-crc64ecma'],
  }
}

export function serializeUploadPartCopy(request: UploadPartCopyRequest): OperationInput {
  const bucket = requireField(request.bucket, 'bucket')
  const key = requireField(request.key, 'key')
  const uploadId = requireField(request.uploadId, 'uploadId')
  const partNumber = requireField(request.partNumber, 'partNumber')
  const sourceKey = requireField(request.sourceKey, 'sourceKey')

  const headers = createHeaderFields(request.headers)
  // Source-key slashes are encoded as part of one path segment.
  let source = '/' + (request.sourceBucket ?? bucket) + '/' + escapeUriComponent(sourceKey)
  if (request.sourceVersionId !== undefined) source += '?versionId=' + request.sourceVersionId
  setHeaderString(headers, 'x-oss-copy-source', source)
  setHeaderString(headers, 'x-oss-copy-source-range', request.copySourceRange)
  setHeaderString(headers, 'x-oss-copy-source-if-match', request.copySourceIfMatch)
  setHeaderString(headers, 'x-oss-copy-source-if-none-match', request.copySourceIfNoneMatch)
  setHeaderString(headers, 'x-oss-copy-source-if-modified-since', request.copySourceIfModifiedSince)
  setHeaderString(headers, 'x-oss-copy-source-if-unmodified-since', request.copySourceIfUnmodifiedSince)
  setContentTypeIfAbsent(headers, 'application/xml')
  setDefaultContentMd5(headers)

  const parameters: Record<string, string> = {}
  copyInto(parameters, request.parameters)
  setNumber(parameters, 'partNumber', partNumber)
  setString(parameters, 'uploadId', uploadId)

  return { opName: 'UploadPartCopy', method: 'PUT', bucket, key, headers, parameters }
}

export async function deserializeUploadPartCopy(output: OperationOutput): Promise<UploadPartCopyResult> {
  const common = resultCommon(output)
  const headers = common.headers
  const text = output.body === undefined ? '' : await output.body.text()
  let lastModified: Date | undefined
  let etag: string | undefined
  if (text.length > 0) {
    const root = parseNamedRoot(text, 'CopyPartResult')
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
  }
}

export function serializeAbortMultipartUpload(request: AbortMultipartUploadRequest): OperationInput {
  const bucket = requireField(request.bucket, 'bucket')
  const key = requireField(request.key, 'key')
  const uploadId = requireField(request.uploadId, 'uploadId')

  const headers = createHeaderFields(request.headers)
  setContentTypeIfAbsent(headers, 'application/xml')
  setDefaultContentMd5(headers)

  const parameters: Record<string, string> = {}
  copyInto(parameters, request.parameters)
  setString(parameters, 'uploadId', uploadId)

  return { opName: 'AbortMultipartUpload', method: 'DELETE', bucket, key, headers, parameters }
}

export async function deserializeAbortMultipartUpload(
  output: OperationOutput,
): Promise<AbortMultipartUploadResult> {
  const common = resultCommon(output)
  if (output.body !== undefined) await output.body.bytes()
  return common
}

export function serializeListMultipartUploads(request: ListMultipartUploadsRequest): OperationInput {
  const bucket = requireField(request.bucket, 'bucket')

  const headers = createHeaderFields(request.headers)
  setContentTypeIfAbsent(headers, 'application/xml')
  setDefaultContentMd5(headers)

  const parameters: Record<string, string> = { uploads: '', 'encoding-type': 'url' }
  copyInto(parameters, request.parameters)
  setString(parameters, 'delimiter', request.delimiter)
  setNumber(parameters, 'max-uploads', request.maxUploads)
  setString(parameters, 'key-marker', request.keyMarker)
  setString(parameters, 'prefix', request.prefix)
  setString(parameters, 'upload-id-marker', request.uploadIdMarker)
  setString(parameters, 'encoding-type', request.encodingType)

  return { opName: 'ListMultipartUploads', method: 'GET', bucket, headers, parameters }
}

export async function deserializeListMultipartUploads(
  output: OperationOutput,
): Promise<ListMultipartUploadsResult> {
  const common = resultCommon(output)
  const root = parseNamedRoot(output.body === undefined ? '' : await output.body.text(), 'ListMultipartUploadsResult')
  const encodingType = textOf(root, 'EncodingType')
  const decode = encodingType !== undefined && encodingType.toLowerCase() === 'url'

  const uploads: Upload[] = []
  for (const node of childrenOf(root, 'Upload')) {
    uploads.push({
      key: urlDecode(textOf(node, 'Key'), decode),
      uploadId: textOf(node, 'UploadId'),
      initiated: textOf(node, 'Initiated'),
    })
  }

  return {
    status: common.status,
    statusCode: common.statusCode,
    requestId: common.requestId,
    headers: common.headers,
    bucket: textOf(root, 'Bucket'),
    keyMarker: urlDecode(textOf(root, 'KeyMarker'), decode),
    uploadIdMarker: textOf(root, 'UploadIdMarker'),
    nextKeyMarker: urlDecode(textOf(root, 'NextKeyMarker'), decode),
    nextUploadIdMarker: textOf(root, 'NextUploadIdMarker'),
    delimiter: urlDecode(textOf(root, 'Delimiter'), decode),
    prefix: urlDecode(textOf(root, 'Prefix'), decode),
    maxUploads: toNumber(textOf(root, 'MaxUploads')),
    isTruncated: toBoolean(textOf(root, 'IsTruncated')),
    encodingType,
    uploads: uploads.length > 0 ? uploads : undefined,
  }
}

export function serializeListParts(request: ListPartsRequest): OperationInput {
  const bucket = requireField(request.bucket, 'bucket')
  const key = requireField(request.key, 'key')
  const uploadId = requireField(request.uploadId, 'uploadId')

  const headers = createHeaderFields(request.headers)
  setContentTypeIfAbsent(headers, 'application/xml')
  setDefaultContentMd5(headers)

  const parameters: Record<string, string> = { 'encoding-type': 'url' }
  copyInto(parameters, request.parameters)
  setString(parameters, 'uploadId', uploadId)
  setNumber(parameters, 'max-parts', request.maxParts)
  setNumber(parameters, 'part-number-marker', request.partNumberMarker)
  setString(parameters, 'encoding-type', request.encodingType)

  return { opName: 'ListParts', method: 'GET', bucket, key, headers, parameters }
}

function readPart(node: XmlNode): Part {
  return {
    partNumber: toNumber(textOf(node, 'PartNumber')),
    etag: textOf(node, 'ETag'),
    size: toNumber(textOf(node, 'Size')),
    lastModified: toDate(textOf(node, 'LastModified')),
  }
}

export async function deserializeListParts(output: OperationOutput): Promise<ListPartsResult> {
  const common = resultCommon(output)
  const root = parseNamedRoot(output.body === undefined ? '' : await output.body.text(), 'ListPartsResult')
  const encodingType = textOf(root, 'EncodingType')
  const decode = encodingType !== undefined && encodingType.toLowerCase() === 'url'

  const parts: Part[] = []
  for (const node of childrenOf(root, 'Part')) parts.push(readPart(node))

  return {
    status: common.status,
    statusCode: common.statusCode,
    requestId: common.requestId,
    headers: common.headers,
    bucket: textOf(root, 'Bucket'),
    key: urlDecode(textOf(root, 'Key'), decode),
    uploadId: textOf(root, 'UploadId'),
    partNumberMarker: toNumber(textOf(root, 'PartNumberMarker')),
    nextPartNumberMarker: toNumber(textOf(root, 'NextPartNumberMarker')),
    maxParts: toNumber(textOf(root, 'MaxParts')),
    isTruncated: toBoolean(textOf(root, 'IsTruncated')),
    encodingType,
    parts: parts.length > 0 ? parts : undefined,
  }
}

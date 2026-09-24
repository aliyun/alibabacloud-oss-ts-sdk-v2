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
  DeleteObjectTaggingRequest,
  DeleteObjectTaggingResult,
  GetObjectTaggingRequest,
  GetObjectTaggingResult,
  PutObjectTaggingRequest,
  PutObjectTaggingResult,
  Tag,
  Tagging,
} from '../models/object-tagging.js'
import {
  requireField,
  resultCommon,
  setDefaultContentMd5,
  setContentTypeIfAbsent,
  setString,
} from './common.js'

function taggingBodyXml(tagging: Tagging): string {
  const tagNodes: XmlNode[] = []
  for (const tag of tagging.tagSet?.tags ?? []) {
    const fields: XmlNode[] = []
    if (tag.key !== undefined) fields.push({ name: 'Key', text: tag.key, children: [] })
    if (tag.value !== undefined) fields.push({ name: 'Value', text: tag.value, children: [] })
    tagNodes.push({ name: 'Tag', text: '', children: fields })
  }
  const tagSet: XmlNode = { name: 'TagSet', text: '', children: tagNodes }
  return buildXml({ name: 'Tagging', text: '', children: [tagSet] })
}

export function serializePutObjectTagging(request: PutObjectTaggingRequest): OperationInput {
  const bucket = requireField(request.bucket, 'bucket')
  const key = requireField(request.key, 'key')
  const body = request.tagging === undefined ? undefined : taggingBodyXml(request.tagging)

  const headers = createHeaderFields(request.headers)
  setContentTypeIfAbsent(headers, 'application/xml')
  setDefaultContentMd5(headers, body === undefined ? undefined : toBase64(md5(utf8Encode(body))))

  const parameters: Record<string, string> = { tagging: '' }
  copyInto(parameters, request.parameters)
  setString(parameters, 'versionId', request.versionId)

  return { opName: 'PutObjectTagging', method: 'PUT', bucket, key, headers, parameters, body }
}

export async function deserializePutObjectTagging(output: OperationOutput): Promise<PutObjectTaggingResult> {
  const common = resultCommon(output)
  const headers = common.headers
  if (output.body !== undefined) await output.body.bytes()
  return {
    status: common.status,
    statusCode: common.statusCode,
    requestId: common.requestId,
    headers,
    versionId: headers['x-oss-version-id'],
  }
}

export function serializeGetObjectTagging(request: GetObjectTaggingRequest): OperationInput {
  const bucket = requireField(request.bucket, 'bucket')
  const key = requireField(request.key, 'key')

  const headers = createHeaderFields(request.headers)
  setContentTypeIfAbsent(headers, 'application/xml')
  setDefaultContentMd5(headers)

  const parameters: Record<string, string> = { tagging: '' }
  copyInto(parameters, request.parameters)
  setString(parameters, 'versionId', request.versionId)

  return { opName: 'GetObjectTagging', method: 'GET', bucket, key, headers, parameters }
}

function readTagging(root: XmlNode): Tagging {
  const tagSetNode = childOf(root, 'TagSet')
  const tags: Tag[] = []
  if (tagSetNode !== undefined) {
    for (const node of childrenOf(tagSetNode, 'Tag')) {
      tags.push({ key: textOf(node, 'Key'), value: textOf(node, 'Value') })
    }
  }
  return { tagSet: { tags: tags.length > 0 ? tags : undefined } }
}

export async function deserializeGetObjectTagging(output: OperationOutput): Promise<GetObjectTaggingResult> {
  const common = resultCommon(output)
  const text = output.body === undefined ? '' : await output.body.text()
  let root: XmlNode
  try {
    root = parseXml(text)
  } catch (err) {
    throw new DeserializationError('the response body is not XML', err instanceof Error ? err : undefined)
  }
  if (root.name !== 'Tagging') {
    throw new DeserializationError('expected element type <Tagging> but have <' + root.name + '>')
  }
  return {
    status: common.status,
    statusCode: common.statusCode,
    requestId: common.requestId,
    headers: common.headers,
    tagging: readTagging(root),
  }
}

export function serializeDeleteObjectTagging(request: DeleteObjectTaggingRequest): OperationInput {
  const bucket = requireField(request.bucket, 'bucket')
  const key = requireField(request.key, 'key')

  const headers = createHeaderFields(request.headers)
  setContentTypeIfAbsent(headers, 'application/xml')
  setDefaultContentMd5(headers)

  const parameters: Record<string, string> = { tagging: '' }
  copyInto(parameters, request.parameters)
  setString(parameters, 'versionId', request.versionId)

  return { opName: 'DeleteObjectTagging', method: 'DELETE', bucket, key, headers, parameters }
}

export async function deserializeDeleteObjectTagging(
  output: OperationOutput,
): Promise<DeleteObjectTaggingResult> {
  const common = resultCommon(output)
  if (output.body !== undefined) await output.body.bytes()
  return common
}

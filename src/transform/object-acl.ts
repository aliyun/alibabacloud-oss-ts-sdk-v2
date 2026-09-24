import { DeserializationError } from '../error/types.js'
import type { OperationInput, OperationOutput } from '../types.js'
import { createHeaderFields } from '../utils/header-fields.js'
import { copyInto } from '../utils/record.js'
import type { XmlNode } from '../xml/parse.js'
import { childOf, parseXml, textOf } from '../xml/parse.js'
import type { AccessControlList, Owner } from '../models/bucket-basic.js'
import type { AccessControlPolicy } from '../models/bucket-acl.js'
import type {
  GetObjectAclRequest,
  GetObjectAclResult,
  PutObjectAclRequest,
  PutObjectAclResult,
} from '../models/object-acl.js'
import {
  requireField,
  resultCommon,
  setDefaultContentMd5,
  setContentTypeIfAbsent,
  setHeaderString,
  setString,
} from './common.js'

export function serializePutObjectAcl(request: PutObjectAclRequest): OperationInput {
  const bucket = requireField(request.bucket, 'bucket')
  const key = requireField(request.key, 'key')
  const objectAcl = requireField(request.objectAcl, 'objectAcl')

  const headers = createHeaderFields(request.headers)
  setHeaderString(headers, 'x-oss-object-acl', objectAcl)
  setContentTypeIfAbsent(headers, 'application/xml')
  setDefaultContentMd5(headers)

  const parameters: Record<string, string> = { acl: '' }
  copyInto(parameters, request.parameters)
  setString(parameters, 'versionId', request.versionId)

  return { opName: 'PutObjectAcl', method: 'PUT', bucket, key, headers, parameters }
}

export async function deserializePutObjectAcl(output: OperationOutput): Promise<PutObjectAclResult> {
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

export function serializeGetObjectAcl(request: GetObjectAclRequest): OperationInput {
  const bucket = requireField(request.bucket, 'bucket')
  const key = requireField(request.key, 'key')

  const headers = createHeaderFields(request.headers)
  setContentTypeIfAbsent(headers, 'application/xml')
  setDefaultContentMd5(headers)

  const parameters: Record<string, string> = { acl: '' }
  copyInto(parameters, request.parameters)
  setString(parameters, 'versionId', request.versionId)

  return { opName: 'GetObjectAcl', method: 'GET', bucket, key, headers, parameters }
}

function readOwner(root: XmlNode): Owner | undefined {
  const owner = childOf(root, 'Owner')
  if (owner === undefined) return undefined
  return { id: textOf(owner, 'ID'), displayName: textOf(owner, 'DisplayName') }
}

function readAccessControlList(root: XmlNode): AccessControlList | undefined {
  const acl = childOf(root, 'AccessControlList')
  if (acl === undefined) return undefined
  return { grant: textOf(acl, 'Grant') }
}

export async function deserializeGetObjectAcl(output: OperationOutput): Promise<GetObjectAclResult> {
  const common = resultCommon(output)
  const text = output.body === undefined ? '' : await output.body.text()
  let root: XmlNode
  try {
    root = parseXml(text)
  } catch (err) {
    throw new DeserializationError('the response body is not XML', err instanceof Error ? err : undefined)
  }
  if (root.name !== 'AccessControlPolicy') {
    throw new DeserializationError('expected element type <AccessControlPolicy> but have <' + root.name + '>')
  }
  const accessControlPolicy: AccessControlPolicy = {
    owner: readOwner(root),
    accessControlList: readAccessControlList(root),
  }
  return {
    status: common.status,
    statusCode: common.statusCode,
    requestId: common.requestId,
    headers: common.headers,
    accessControlPolicy,
  }
}

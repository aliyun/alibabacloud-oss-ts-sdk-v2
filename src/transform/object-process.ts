import type { OperationInput, OperationOutput } from '../types.js'
import { toBase64 } from '../utils/base64.js'
import { utf8Encode } from '../utils/bytes.js'
import { md5 } from '../utils/md5.js'
import { createHeaderFields } from '../utils/header-fields.js'
import { copyInto } from '../utils/record.js'
import type {
  AsyncProcessObjectRequest,
  AsyncProcessObjectResult,
  ProcessObjectRequest,
  ProcessObjectResult,
} from '../models/object-process.js'
import { requireField, resultCommon, setDefaultContentMd5, setContentTypeIfAbsent } from './common.js'

export function serializeProcessObject(request: ProcessObjectRequest): OperationInput {
  const bucket = requireField(request.bucket, 'bucket')
  const key = requireField(request.key, 'key')
  const process = requireField(request.process, 'process')
  const body = 'x-oss-process=' + process

  const headers = createHeaderFields(request.headers)
  setContentTypeIfAbsent(headers, 'application/xml')
  setDefaultContentMd5(headers, toBase64(md5(utf8Encode(body))))

  const parameters: Record<string, string> = { 'x-oss-process': '' }
  copyInto(parameters, request.parameters)

  return { opName: 'ProcessObject', method: 'POST', bucket, key, headers, parameters, body }
}

export async function deserializeProcessObject(output: OperationOutput): Promise<ProcessObjectResult> {
  const common = resultCommon(output)
  const text = output.body === undefined ? '' : await output.body.text()
  return {
    status: common.status,
    statusCode: common.statusCode,
    requestId: common.requestId,
    headers: common.headers,
    body: text.length > 0 ? text : undefined,
  }
}

export function serializeAsyncProcessObject(request: AsyncProcessObjectRequest): OperationInput {
  const bucket = requireField(request.bucket, 'bucket')
  const key = requireField(request.key, 'key')
  const process = requireField(request.process, 'process')
  const body = 'x-oss-async-process=' + process

  const headers = createHeaderFields(request.headers)
  setContentTypeIfAbsent(headers, 'application/xml')
  setDefaultContentMd5(headers, toBase64(md5(utf8Encode(body))))

  const parameters: Record<string, string> = { 'x-oss-async-process': '' }
  copyInto(parameters, request.parameters)

  return { opName: 'AsyncProcessObject', method: 'POST', bucket, key, headers, parameters, body }
}

export async function deserializeAsyncProcessObject(output: OperationOutput): Promise<AsyncProcessObjectResult> {
  const common = resultCommon(output)
  const text = output.body === undefined ? '' : await output.body.text()
  return {
    status: common.status,
    statusCode: common.statusCode,
    requestId: common.requestId,
    headers: common.headers,
    body: text.length > 0 ? text : undefined,
  }
}

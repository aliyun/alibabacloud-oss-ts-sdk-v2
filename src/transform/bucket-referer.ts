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
  GetBucketRefererRequest,
  GetBucketRefererResult,
  PutBucketRefererRequest,
  PutBucketRefererResult,
  RefererConfiguration,
  RefererList,
} from '../models/bucket-referer.js'
import { requireField, resultCommon, setDefaultContentMd5, setContentTypeIfAbsent, toBoolean } from './common.js'

function refererListXml(name: string, referers: string[] | undefined): XmlNode {
  const children: XmlNode[] = []
  for (const referer of referers ?? []) children.push({ name: 'Referer', text: referer, children: [] })
  return { name, text: '', children }
}

/** The `<RefererConfiguration>` body, or `undefined` when the request carries no configuration. */
function refererConfigurationXml(config: RefererConfiguration | undefined): string | undefined {
  if (config === undefined) return undefined
  const children: XmlNode[] = []
  if (config.allowEmptyReferer !== undefined) {
    children.push({ name: 'AllowEmptyReferer', text: String(config.allowEmptyReferer), children: [] })
  }
  if (config.allowTruncateQueryString !== undefined) {
    children.push({ name: 'AllowTruncateQueryString', text: String(config.allowTruncateQueryString), children: [] })
  }
  if (config.truncatePath !== undefined) {
    children.push({ name: 'TruncatePath', text: String(config.truncatePath), children: [] })
  }
  if (config.refererList !== undefined) children.push(refererListXml('RefererList', config.refererList.referers))
  if (config.refererBlacklist !== undefined) {
    children.push(refererListXml('RefererBlacklist', config.refererBlacklist.referers))
  }
  return buildXml({ name: 'RefererConfiguration', text: '', children })
}

export function serializePutBucketReferer(request: PutBucketRefererRequest): OperationInput {
  const bucket = requireField(request.bucket, 'bucket')
  const body = refererConfigurationXml(request.refererConfiguration)

  const headers = createHeaderFields(request.headers)
  setContentTypeIfAbsent(headers, 'application/xml')
  setDefaultContentMd5(headers, body === undefined ? undefined : toBase64(md5(utf8Encode(body))))

  const parameters: Record<string, string> = { referer: '' }
  copyInto(parameters, request.parameters)

  return { opName: 'PutBucketReferer', method: 'PUT', bucket, headers, parameters, body }
}

export async function deserializePutBucketReferer(output: OperationOutput): Promise<PutBucketRefererResult> {
  const common = resultCommon(output)
  if (output.body !== undefined) await output.body.bytes()
  return common
}

export function serializeGetBucketReferer(request: GetBucketRefererRequest): OperationInput {
  const bucket = requireField(request.bucket, 'bucket')

  const headers = createHeaderFields(request.headers)
  setDefaultContentMd5(headers)

  const parameters: Record<string, string> = { referer: '' }
  copyInto(parameters, request.parameters)

  return { opName: 'GetBucketReferer', method: 'GET', bucket, headers, parameters }
}

function readRefererList(node: XmlNode, name: string): RefererList | undefined {
  const container = childOf(node, name)
  if (container === undefined) return undefined
  const referers: string[] = []
  for (const child of childrenOf(container, 'Referer')) referers.push(child.text.trim())
  return { referers }
}

function readRefererConfiguration(root: XmlNode): RefererConfiguration {
  return {
    allowEmptyReferer: toBoolean(textOf(root, 'AllowEmptyReferer')),
    allowTruncateQueryString: toBoolean(textOf(root, 'AllowTruncateQueryString')),
    truncatePath: toBoolean(textOf(root, 'TruncatePath')),
    refererList: readRefererList(root, 'RefererList'),
    refererBlacklist: readRefererList(root, 'RefererBlacklist'),
  }
}

export async function deserializeGetBucketReferer(output: OperationOutput): Promise<GetBucketRefererResult> {
  const common = resultCommon(output)
  const text = output.body === undefined ? '' : await output.body.text()
  let root: XmlNode
  try {
    root = parseXml(text)
  } catch (err) {
    throw new DeserializationError('the response body is not XML', err instanceof Error ? err : undefined)
  }
  if (root.name !== 'RefererConfiguration') {
    throw new DeserializationError('expected element type <RefererConfiguration> but have <' + root.name + '>')
  }
  return {
    status: common.status,
    statusCode: common.statusCode,
    requestId: common.requestId,
    headers: common.headers,
    refererConfiguration: readRefererConfiguration(root),
  }
}

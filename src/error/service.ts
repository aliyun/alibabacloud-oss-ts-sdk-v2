import type { ResponseMessage } from '../transport/types.js'
import { fromBase64 } from '../utils/base64.js'
import { utf8Decode } from '../utils/bytes.js'
import { parseHttpTime } from '../utils/time.js'
import { lowerCaseKeys } from '../utils/record.js'
import { parseXml, textOf } from '../xml/parse.js'
import { ServiceError } from './types.js'

const SNAPSHOT_LIMIT = 256

const NON_ERROR_THROWN = 'a thrown value that was not an Error'

/** Describes an error as text without throwing. */
function describeError(err: Error): string {
  try {
    return String(err)
  } catch {
    return 'a value that could not be converted to a string'
  }
}

/** Truncates without splitting a surrogate pair. */
function truncate(body: string): string {
  if (body.length <= SNAPSHOT_LIMIT) return body
  const last = body.charCodeAt(SNAPSHOT_LIMIT - 1)
  const end = last >= 0xd800 && last <= 0xdbff ? SNAPSHOT_LIMIT - 1 : SNAPSHOT_LIMIT
  return body.substring(0, end)
}

/** Converts a non-2xx response into a `ServiceError` without throwing. */
export async function toServiceError(response: ResponseMessage, requestTarget: string): Promise<ServiceError> {
  const headers = lowerCaseKeys(response.headers)
  let requestId = headers['x-oss-request-id'] ?? ''
  let ec = headers['x-oss-ec'] ?? ''
  const timestamp = parseHttpTime(headers['date'] ?? '')

  let body = ''
  if (response.body !== undefined) {
    try {
      body = await response.body.text()
    } catch (err) {
      return new ServiceError({
        statusCode: response.statusCode,
        code: 'BadErrorResponse',
        message:
          'The body of the response was not readable, due to :' +
          (err instanceof Error ? describeError(err) : NON_ERROR_THROWN),
        requestId,
        ec,
        headers: response.headers,
        timestamp,
        requestTarget,
      })
    }
  }

  const errHeader = headers['x-oss-err'] ?? ''
  if (body.length === 0 && errHeader.length > 0) {
    try {
      body = utf8Decode(fromBase64(errHeader))
    } catch {
      body = ''
    }
  }

  const snapshot = truncate(body)

  let code = 'BadErrorResponse'
  let message = ''
  let hostId: string | undefined
  let failure = ''
  try {
    const root = parseXml(body)
    if (root.name === 'Error') {
      code = textOf(root, 'Code') ?? code
      message = textOf(root, 'Message') ?? ''
      requestId = textOf(root, 'RequestId') ?? requestId
      ec = textOf(root, 'EC') ?? ec
      hostId = textOf(root, 'HostId')
    } else {
      failure = 'expected element type <Error> but have <' + root.name + '>'
    }
  } catch (err) {
    failure = err instanceof Error ? describeError(err) : NON_ERROR_THROWN
  }
  if (failure.length > 0) {
    message = 'Failed to parse xml from response body due to: ' + failure + '. With part response body ' + snapshot + '.'
  }

  return new ServiceError({
    statusCode: response.statusCode,
    code,
    message,
    requestId,
    ec,
    hostId,
    headers: response.headers,
    timestamp,
    requestTarget,
    snapshot,
  })
}

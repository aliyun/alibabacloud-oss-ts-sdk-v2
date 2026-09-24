import * as process from 'node:process'
import * as oss from '@alicloud/oss-v2'
import { EnvironmentVariableCredentialsProvider } from '@alicloud/oss-v2/node'

function required(name) {
  const value = process.env[name] ?? ''
  if (value.length === 0) {
    console.error('missing environment variable: ' + name)
    process.exit(2)
  }
  return value
}

export function createClient() {
  return new oss.Client({
    region: required('OSS_REGION'),
    endpoint: process.env['OSS_ENDPOINT'],
    // Reads OSS_ACCESS_KEY_ID, OSS_ACCESS_KEY_SECRET and the optional OSS_SESSION_TOKEN on every call.
    credentialsProvider: new EnvironmentVariableCredentialsProvider(),
  })
}

export function bucket() {
  return required('OSS_BUCKET')
}

/**
 * The block worth copying. When the service reported the failure, `client.send` wraps it in an
 * `OperationError` naming the operation, and the `ServiceError` with the code and the request id
 * sits somewhere down that error's `cause` chain -- which is what `contains` walks.
 */
export function report(error) {
  const service =
    error instanceof oss.OperationError ? error.contains((e) => e instanceof oss.ServiceError) : undefined
  // The same `instanceof` twice is the documented call form: `OssError.contains` returns
  // `Error | undefined`, and the second test narrows it with no cast.
  if (service instanceof oss.ServiceError) {
    console.error('request failed')
    console.error('  operation:  ' + error.opName)
    console.error('  code:       ' + service.code)
    // `errorMessage`, not `message`: `ServiceError.message` is a newline-separated composite that
    // already carries the status code, the code and the request id.
    console.error('  message:    ' + service.errorMessage)
    console.error('  requestId:  ' + service.requestId)
    console.error('  statusCode: ' + String(service.statusCode))
    console.error('  ec:         ' + service.ec)
  } else {
    // No ServiceError means the service never reported a failure -- so there is no request id to
    // quote, and the error itself is all the evidence there is. It may come from the SDK's own
    // checks, from the network, or from a reply that arrived but would not parse.
    console.error('request failed: ' + String(error))
  }
  process.exit(1)
}

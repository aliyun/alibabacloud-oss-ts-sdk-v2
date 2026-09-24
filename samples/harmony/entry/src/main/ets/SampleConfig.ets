import { Client, StaticCredentialsProvider, OperationError, ServiceError } from '@alicloud/oss-v2'

// Fill these in. `endpoint` may stay empty; the client derives the public one from `region`.
const region = 'cn-hangzhou'
const endpoint = ''
const bucketName = 'my-bucket'

// Fetch and refresh STS credentials from your backend in a real app.
const stsAccessKeyId = ''
const stsAccessKeySecret = ''
const stsSecurityToken = ''

export function createClient(): Client {
  return new Client({
    region: region,
    endpoint: endpoint.length > 0 ? endpoint : undefined,
    credentialsProvider: new StaticCredentialsProvider(stsAccessKeyId, stsAccessKeySecret, stsSecurityToken),
  })
}

export function bucket(): string {
  return bucketName
}

/** Logs service error details found in an `OperationError` cause chain. */
export function report(error: Error): void {
  const service: Error | undefined =
    error instanceof OperationError ? error.contains((e: Error) => e instanceof ServiceError) : undefined
  if (service instanceof ServiceError) {
    console.error('request failed')
    console.error('  operation:  ' + (error as OperationError).opName)
    console.error('  code:       ' + service.code)
    // `errorMessage`, not `message`: `ServiceError.message` is a newline-separated composite that
    // already carries the status code, the code and the request id.
    console.error('  message:    ' + service.errorMessage)
    console.error('  requestId:  ' + service.requestId)
    console.error('  statusCode: ' + service.statusCode)
    console.error('  ec:         ' + service.ec)
  } else {
    console.error('request failed: ' + error)
  }
}

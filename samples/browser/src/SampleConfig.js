// The client setup and error reporter every browser sample shares; not a sample itself. The one
// difference from the node build is credentials: a browser must not carry a long-lived AccessKey, so
// the client signs with STS credentials fetched from your own backend. The transport is not named --
// the bundler reads the package.json `browser` field and picks the browser one, the same way the node
// build gets the node one.
import * as oss from '@alicloud/oss-v2'
import { region, endpoint, bucket as bucketName, stsEndpoint } from './config.js'

// Re-fetched on every call, so the client always signs with credentials that have not yet expired.
async function fetchStsCredentials() {
  const response = await fetch(stsEndpoint)
  if (!response.ok) throw new Error('STS backend returned ' + String(response.status))
  const body = await response.json()
  return {
    accessKeyId: body.accessKeyId,
    accessKeySecret: body.accessKeySecret,
    securityToken: body.securityToken,
  }
}

export function createClient() {
  return new oss.Client({
    region,
    endpoint: endpoint.length > 0 ? endpoint : undefined,
    credentialsProvider: { getCredentials: fetchStsCredentials },
  })
}

export function bucket() {
  return bucketName
}

export function report(error, log) {
  const service =
    error instanceof oss.OperationError ? error.contains((e) => e instanceof oss.ServiceError) : undefined
  if (service instanceof oss.ServiceError) {
    log('request failed')
    log('  operation:  ' + error.opName)
    log('  code:       ' + service.code)
    log('  message:    ' + service.errorMessage)
    log('  requestId:  ' + service.requestId)
    log('  statusCode: ' + String(service.statusCode))
    log('  ec:         ' + service.ec)
  } else {
    log('request failed: ' + String(error))
  }
}

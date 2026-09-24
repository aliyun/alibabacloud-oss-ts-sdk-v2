// Demonstrates: Sign with STS credentials from a custom provider, the plain object that structural
// typing lets you pass where a `CredentialsProvider` is expected -- no adapter class needed.
import * as oss from '@alicloud/oss-v2'
import { region, endpoint, bucket, stsEndpoint } from '../config.js'

// This is the shape SampleConfig hides: `getCredentials` fetches short-lived STS credentials from
// your own backend and hands back fresh ones each call. It is the only safe credential path in a
// browser -- a long-lived AccessKey must never reach the client.
const provider = {
  getCredentials: async () => {
    const response = await fetch(stsEndpoint)
    if (!response.ok) throw new Error('STS backend returned ' + String(response.status))
    const body = await response.json()
    return {
      accessKeyId: body.accessKeyId,
      accessKeySecret: body.accessKeySecret,
      securityToken: body.securityToken,
      expiration: body.expiration,
    }
  },
}

export async function run(log, key = 'sample/hello.txt') {
  try {
    const client = new oss.Client({
      region,
      endpoint: endpoint.length > 0 ? endpoint : undefined,
      credentialsProvider: provider,
    })
    const result = await client.send(new oss.HeadObject({ bucket, key }))
    log('signed with STS credentials; head ' + key)
    log('  etag:      ' + result.etag)
    log('  requestId: ' + result.requestId)
  } catch (error) {
    const service =
      error instanceof oss.OperationError ? error.contains((e) => e instanceof oss.ServiceError) : undefined
    if (service instanceof oss.ServiceError) {
      log('request failed: ' + service.code + ' (' + service.requestId + ')')
    } else {
      log('request failed: ' + String(error))
    }
  }
}

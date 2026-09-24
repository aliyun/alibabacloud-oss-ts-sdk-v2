// Demonstrates: Sign with STS credentials from a custom provider, the plain object that structural
// typing lets you pass where a `CredentialsProvider` is expected -- no adapter class needed.
import * as process from 'node:process'
import * as oss from '@alicloud/oss-v2'

function required(name) {
  const value = process.env[name] ?? ''
  if (value.length === 0) {
    console.error('missing environment variable: ' + name)
    process.exit(2)
  }
  return value
}

// In a real browser or app, `getCredentials` fetches short-lived STS credentials from your own
// backend and can hand back fresh ones each call; never ship a long-lived AccessKey to a client.
const provider = {
  getCredentials: async () => ({
    accessKeyId: required('OSS_STS_ACCESS_KEY_ID'),
    accessKeySecret: required('OSS_STS_ACCESS_KEY_SECRET'),
    securityToken: required('OSS_STS_SECURITY_TOKEN'),
  }),
}

const key = process.argv[2] ?? 'sample/hello.txt'

try {
  const client = new oss.Client({
    region: required('OSS_REGION'),
    endpoint: process.env['OSS_ENDPOINT'],
    credentialsProvider: provider,
  })
  const result = await client.send(new oss.HeadObject({ bucket: required('OSS_BUCKET'), key }))
  console.log('signed with STS credentials; head ' + key)
  console.log('  etag:      ' + result.etag)
  console.log('  requestId: ' + result.requestId)
} catch (error) {
  const service =
    error instanceof oss.OperationError ? error.contains((e) => e instanceof oss.ServiceError) : undefined
  if (service instanceof oss.ServiceError) {
    console.error('request failed: ' + service.code + ' (' + service.requestId + ')')
  } else {
    console.error('request failed: ' + String(error))
  }
  process.exit(1)
}

// Demonstrates: Sign with STS credentials from a custom provider.
import { Client, HeadObject, OperationError, ServiceError } from '@alicloud/oss-v2'
import type { Credentials, CredentialsProvider } from '@alicloud/oss-v2'
import { bucket } from '../SampleConfig'

const region = 'cn-hangzhou'

class BackendCredentialsProvider implements CredentialsProvider {
  // Called on every signed request; replace the fixed values with credentials from your backend.
  async getCredentials(): Promise<Credentials> {
    const fetched: Credentials = {
      accessKeyId: '',
      accessKeySecret: '',
      securityToken: '',
    }
    return fetched
  }
}

export async function run(key: string = 'sample/hello.txt'): Promise<void> {
  const client = new Client({
    region: region,
    credentialsProvider: new BackendCredentialsProvider(),
  })
  try {
    const result = await client.send(new HeadObject({ bucket: bucket(), key: key }))
    console.log('signed with STS credentials; head ' + key)
    console.log('  etag:      ' + result.etag)
    console.log('  requestId: ' + result.requestId)
  } catch (error) {
    const service: Error | undefined =
      error instanceof OperationError ? error.contains((e: Error) => e instanceof ServiceError) : undefined
    if (service instanceof ServiceError) {
      console.error('request failed: ' + service.code + ' (' + service.requestId + ')')
    } else {
      console.error('request failed: ' + error)
    }
  }
}

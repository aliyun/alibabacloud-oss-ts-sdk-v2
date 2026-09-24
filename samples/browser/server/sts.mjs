// Local backend that mints short-lived STS credentials for the browser sample.
import * as http from 'node:http'
import * as process from 'node:process'
import credentials from '@alicloud/credentials'

const Credential = credentials.default
const port = 9000

function required(name) {
  const value = process.env[name] ?? ''
  if (value.length === 0) {
    console.error('missing environment variable: ' + name)
    process.exit(2)
  }
  return value
}

// One provider for the whole process: it caches the STS token and re-assumes the role only as the
// cached one nears expiry, so a burst of page loads does not call AssumeRole every time.
const provider = new Credential({
  type: 'ram_role_arn',
  accessKeyId: required('OSS_RAM_ACCESS_KEY_ID'),
  accessKeySecret: required('OSS_RAM_ACCESS_KEY_SECRET'),
  roleArn: required('OSS_STS_ROLE_ARN'),
  roleSessionName: process.env['OSS_STS_ROLE_SESSION_NAME'] ?? 'oss-browser-sample',
})

async function credentialsJson() {
  const model = await provider.getCredential()
  return {
    accessKeyId: model.accessKeyId,
    accessKeySecret: model.accessKeySecret,
    securityToken: model.securityToken,
  }
}

http
  .createServer((request, response) => {
    response.setHeader('Access-Control-Allow-Origin', '*')
    if (request.url !== '/sts') {
      response.statusCode = 404
      response.end()
      return
    }
    credentialsJson().then(
      (body) => {
        response.setHeader('Content-Type', 'application/json')
        response.end(JSON.stringify(body))
      },
      (error) => {
        console.error('assume role failed:', error)
        response.statusCode = 500
        response.end(String(error))
      },
    )
  })
  .listen(port, () => {
    console.log('STS stand-in listening on http://localhost:' + String(port) + '/sts')
  })

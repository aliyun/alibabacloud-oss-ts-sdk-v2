import { createServer } from 'node:http'

/**
 * The loopback stub the ArkTS mock cases call. Port 0 asks the OS for a free one, which the runner reads
 * from the `listening` line and hands to the ArkTS side through `OSS_HARMONY_STUB_PORT`.
 */
const PORT = Number(process.argv[2] ?? '0')
const HOST = '127.0.0.1'
const OBJECT_PATH = '/mock-bucket/dir/hello.txt'
const OBJECT_BODY = 'hello from loopback'

/**
 * @param {import('node:http').ServerResponse} res
 * @param {number} status
 * @param {Record<string, string>} headers
 * @param {string} body
 */
function reply(res, status, headers, body) {
  res.writeHead(status, headers)
  res.end(body)
}

const server = createServer((req, res) => {
  /** @type {Buffer[]} */
  const parts = []
  /** @param {Buffer} chunk */
  const collect = (chunk) => {
    parts.push(chunk)
  }
  req.on('data', collect)
  req.on('end', () => {
    const path = new URL(req.url ?? '/', 'http://' + HOST).pathname
    console.log(`stub received ${req.method} ${path} body=${String(Buffer.concat(parts).length)}B`)

    if (path === '/probe') {
      reply(res, 200, { 'content-type': 'text/plain' }, 'pong')
      return
    }
    if (path === OBJECT_PATH && req.method === 'GET') {
      reply(
        res,
        200,
        { 'content-type': 'text/plain', etag: '"stub-etag"', 'x-oss-request-id': 'stub-request-id' },
        OBJECT_BODY,
      )
      return
    }
    if (path === OBJECT_PATH && req.method === 'PUT') {
      reply(res, 200, { etag: '"stub-etag"', 'x-oss-request-id': 'stub-request-id' }, '')
      return
    }
    reply(res, 404, { 'x-oss-request-id': 'stub-request-id' }, `stub has no route for ${req.method} ${path}`)
  })
})

server.listen(PORT, HOST, () => {
  const bound = /** @type {import('node:net').AddressInfo} */ (server.address())
  console.log(`loopback stub listening on http://${HOST}:${String(bound.port)}`)
})

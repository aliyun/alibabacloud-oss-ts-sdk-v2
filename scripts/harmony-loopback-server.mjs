import { createServer } from 'node:http'

/**
 * The loopback stub the ArkTS mock cases call, in the shape of `tests/mock/support/server.ts`: each
 * scenario is a route plus the replies it hands out in order, reusing its last one, so a flaky route can
 * fail once and then succeed. Requests are counted per method and path, and the ArkTS side reads those
 * counters back over HTTP because it cannot see anything else about what it sent.
 *
 * Port 0 asks the OS for a free port, which the runner reads from the `listening` line and writes into the
 * compiled ArkTS port constants. The suite also gets a port nothing listens on, for the refused case.
 */

/** @type {string} */
const HOST = '127.0.0.1'
/** @type {number} */
const PORT = Number(process.argv[2] ?? '0')
const BUCKET = 'mock-bucket'
const OBJECT_BODY = 'hello from loopback'

/**
 * Both halves are larger than a single socket read carries, so a body the transport truncated or served
 * from a partial buffer cannot pass the integrity case.
 */
const STREAM_BODY = 'a'.repeat(256 * 1024) + 'b'.repeat(256 * 1024)

const PAGE_1 = [
  '<?xml version="1.0" encoding="UTF-8"?>',
  '<ListBucketResult>',
  '<Name>mock-bucket</Name><Prefix>dir/</Prefix><MaxKeys>1</MaxKeys>',
  '<IsTruncated>true</IsTruncated><NextContinuationToken>tok-2</NextContinuationToken>',
  '<Contents><Key>dir/a.txt</Key><Size>3</Size><StorageClass>Standard</StorageClass></Contents>',
  '</ListBucketResult>',
].join('')

const PAGE_2 = [
  '<?xml version="1.0" encoding="UTF-8"?>',
  '<ListBucketResult>',
  '<Name>mock-bucket</Name><Prefix>dir/</Prefix><MaxKeys>1</MaxKeys>',
  '<ContinuationToken>tok-2</ContinuationToken><IsTruncated>false</IsTruncated><KeyCount>1</KeyCount>',
  '<Contents><Key>dir/b.txt</Key><Size>4</Size><StorageClass>IA</StorageClass></Contents>',
  '</ListBucketResult>',
].join('')

const NO_SUCH_KEY = [
  '<Error>',
  '<Code>NoSuchKey</Code>',
  '<Message>The specified key does not exist.</Message>',
  '<RequestId>req-404</RequestId>',
  '<HostId>mock-bucket.oss-cn-beijing.aliyuncs.com</HostId>',
  '</Error>',
].join('')

const INTERNAL_ERROR = '<Error><Code>InternalError</Code><Message>Server error.</Message></Error>'

/**
 * @typedef {object} StubReply
 * @property {number} [status]
 * @property {Record<string, string>} [headers]
 * @property {string} [body]
 */

/**
 * @typedef {object} Scenario
 * @property {string} method
 * @property {string} path
 * @property {Record<string, string>} [query] Extra pairs the request must carry to match this route.
 * @property {StubReply[]} replies Handed out in order; the last one repeats.
 * @property {number} handed How many requests this scenario has already answered.
 * @property {number} bytes The total length of the request bodies it has accepted.
 */

/**
 * @param {string} method
 * @param {string} path
 * @param {Record<string, string> | undefined} query Extra pairs the request must carry to match this route.
 * @param {StubReply[]} replies
 * @returns {Scenario}
 */
function scenario(method, path, query, replies) {
  return { method, path, query, replies, handed: 0, bytes: 0 }
}

/** The headers every OSS response carries, overridable per reply. */
const BASE_HEADERS = { 'x-oss-request-id': 'mock-request-id' }

/** @type {Scenario[]} */
const scenarios = [
  scenario('GET', '/probe', undefined, [{ body: 'pong', headers: { 'content-type': 'text/plain' } }]),

  scenario('GET', `/${BUCKET}/dir/hello.txt`, undefined, [
    { body: OBJECT_BODY, headers: { etag: '"etag-1"', 'content-type': 'text/plain' } },
  ]),

  scenario('GET', `/${BUCKET}/dir/stream.txt`, undefined, [{ body: STREAM_BODY, headers: { etag: '"etag-stream"' } }]),

  scenario('PUT', `/${BUCKET}/dir/hello.json`, undefined, [{ headers: { etag: '"etag-1"' } }]),

  // Reserved for the rejected upload: a route that exists proves the request never reached the socket.
  scenario('PUT', `/${BUCKET}/dir/one-shot.txt`, undefined, [{ headers: { etag: '"etag-3"' } }]),

  // The retry case: refused once, then accepted, so the second attempt's ETag is the one the reader sees.
  scenario('PUT', `/${BUCKET}/dir/flaky.txt`, undefined, [
    { status: 503, body: INTERNAL_ERROR },
    { headers: { etag: '"etag-2"' } },
  ]),

  // Answers 503 forever, for the case that caps the attempt budget at one.
  scenario('PUT', `/${BUCKET}/dir/stopped.txt`, undefined, [{ status: 503, body: INTERNAL_ERROR }]),

  scenario('GET', `/${BUCKET}/dir/missing.txt`, undefined, [
    { status: 404, body: NO_SUCH_KEY, headers: { 'x-oss-request-id': 'req-404' } },
  ]),

  // Declaring the token-bearing page separately is what proves the cursor actually round-tripped: without
  // it the second request would find no route and answer 500.
  scenario('GET', `/${BUCKET}/`, { 'continuation-token': 'tok-2' }, [{ body: PAGE_2 }]),
  scenario('GET', `/${BUCKET}/`, undefined, [{ body: PAGE_1 }]),
]

/**
 * Picks the scenario whose declared query pairs the request carries, preferring the most specific match so
 * a token-bearing request is not taken by the first-page route that its query is a subset of.
 * @param {string} method
 * @param {string} path
 * @param {Record<string, string>} query
 * @returns {Scenario | undefined}
 */
function findScenario(method, path, query) {
  /** @type {Scenario | undefined} */
  let best
  let bestPairs = -1
  for (const item of scenarios) {
    if (item.method !== method || item.path !== path) continue
    const pairs = Object.entries(item.query ?? {})
    if (pairs.some(([key, value]) => query[key] !== value)) continue
    if (pairs.length > bestPairs) {
      best = item
      bestPairs = pairs.length
    }
  }
  return best
}

/**
 * @param {import('node:http').ServerResponse} res
 * @param {number} status
 * @param {Record<string, string>} headers
 * @param {string} body
 */
function reply(res, status, headers, body) {
  // Freezing the headers with writeHead stops Node from adding its own, so say what OSS would say.
  res.writeHead(status, { ...headers, 'content-length': String(Buffer.byteLength(body)) })
  res.end(body)
}

/**
 * Answers an intake probe: the scenario replies normally, and the probe asks for the counters instead.
 * @param {import('node:http').IncomingMessage} req
 * @param {Buffer} body
 * @param {import('node:http').ServerResponse} res
 */
function answer(req, body, res) {
  const url = new URL(req.url ?? '/', 'http://' + HOST)
  const method = req.method ?? 'GET'
  /** @type {Record<string, string>} */
  const query = Object.fromEntries(url.searchParams.entries())

  if (url.pathname === '/__count') {
    const found = findScenario(query['method'] ?? '', query['path'] ?? '', query)
    reply(res, 200, { 'content-type': 'text/plain' }, `count=${String(found?.handed ?? 0)} bytes=${String(found?.bytes ?? 0)}`)
    return
  }

  const found = findScenario(method, url.pathname, query)
  if (found === undefined) {
    console.log(`stub rejected ${method} ${url.pathname}`)
    reply(res, 500, BASE_HEADERS, `stub has no scenario for ${method} ${url.pathname}`)
    return
  }

  found.handed += 1
  found.bytes += body.length
  const chosen = found.replies[Math.min(found.handed - 1, found.replies.length - 1)]
  const status = chosen.status ?? 200
  console.log(`stub replied ${method} ${url.pathname} attempt=${String(found.handed)} status=${String(status)} body=${String(body.length)}B`)
  reply(res, status, { ...BASE_HEADERS, ...chosen.headers }, chosen.body ?? '')
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
    answer(req, Buffer.concat(parts), res)
  })
})

/**
 * Binds and releases a second port, so the connection-refused case aims at something the runner is very
 * unlikely to hand to another listener between here and the request.
 * @returns {Promise<number>}
 */
function findDeadPort() {
  return new Promise((resolve, reject) => {
    const probe = createServer()
    probe.once('error', reject)
    probe.listen(0, HOST, () => {
      const bound = /** @type {import('node:net').AddressInfo} */ (probe.address())
      probe.close(() => resolve(bound.port))
    })
  })
}

server.listen(PORT, HOST, () => {
  const bound = /** @type {import('node:net').AddressInfo} */ (server.address())
  findDeadPort().then(
    (dead) => {
      console.log(`loopback stub listening on http://${HOST}:${String(bound.port)}`)
      console.log(`loopback dead port ${String(dead)}`)
    },
    /** @param {unknown} error */
    (error) => {
      console.error('the stub could not reserve a dead port', error)
      process.exit(1)
    },
  )
})

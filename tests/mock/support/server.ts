import { createServer, type IncomingHttpHeaders, type IncomingMessage, type Server, type ServerResponse } from 'node:http'
import type { AddressInfo } from 'node:net'

/** The host the mock server binds. Every runtime in the mock layer reaches the loopback interface. */
const HOST = '127.0.0.1'

/** A request as the mock server recorded it, after the body was drained. */
export interface RecordedRequest {
  method: string
  /** Pathname only. Path-style addressing, which an IP endpoint forces, puts the bucket first. */
  path: string
  /** Decoded query parameters, keyed by name. */
  query: Record<string, string>
  /** Lowercased header names, as `node:http` hands them over. */
  headers: Record<string, string>
  /** Request body decoded as UTF-8. */
  body: string
}

/** The reply a stub hands back. */
export interface StubResponse {
  /** Defaults to 200. */
  status?: number
  /** Merged over the default `x-oss-request-id`. */
  headers?: Record<string, string>
  /** Whole body. Use `chunks` when the response must arrive in pieces. */
  body?: string
  /**
   * One `res.write` per entry. Consecutive small entries can still leave the socket together, so a case
   * that counts streamed reads sizes each chunk past what a single read can carry.
   */
  chunks?: string[]
}

/** Which recorded request a stub answers. */
export interface RouteMatch {
  method: string
  /** Pathname, compared exactly. */
  path: string
  /** Each entry has to appear in the request query. Absent: any query matches. */
  query?: Record<string, string>
}

interface Route {
  match: RouteMatch
  replies: StubResponse[]
  served: number
}

const UNROUTED: StubResponse = { status: 500, body: 'mock server has no stub for this request' }

function flatten(headers: IncomingHttpHeaders): Record<string, string> {
  const flat: Record<string, string> = {}
  for (const name of Object.keys(headers)) {
    const value = headers[name]
    flat[name] = Array.isArray(value) ? value.join(', ') : value ?? ''
  }
  return flat
}

function drain(req: IncomingMessage): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const parts: Buffer[] = []
    req.on('data', (chunk: Buffer) => parts.push(chunk))
    req.on('end', () => resolve(Buffer.concat(parts)))
    req.on('error', reject)
  })
}

function matchesWantedQuery(wanted: Record<string, string> | undefined, seen: Record<string, string>): boolean {
  if (wanted === undefined) return true
  for (const name of Object.keys(wanted)) {
    if (seen[name] !== wanted[name]) return false
  }
  return true
}

/**
 * A local HTTP server serving canned OSS responses, so a `Client` can be driven end to end through a
 * real transport and real network library without reaching the service.
 */
export class MockOssServer {
  /** Every request the server answered, in arrival order. */
  readonly requests: RecordedRequest[] = []
  private readonly routes: Route[] = []
  private unrouted: StubResponse = UNROUTED
  private server: Server | undefined
  private endpointUrl = ''

  /**
   * Answers matching requests with `replies` in order, reusing the last one afterwards. Earlier
   * registrations win, so a route pinned to a query has to be registered before a general one.
   */
  on(match: RouteMatch, ...replies: StubResponse[]): this {
    this.routes.push({ match, replies, served: 0 })
    return this
  }

  /** Answers anything no route matched. Defaults to a 500 that names the problem. */
  onUnrouted(reply: StubResponse): this {
    this.unrouted = reply
    return this
  }

  /** Listens on an OS-assigned loopback port and returns the value for `Config.endpoint`. */
  async start(): Promise<string> {
    const server = createServer((req, res) => {
      void this.answer(req, res)
    })
    await new Promise<void>((resolve) => server.listen(0, HOST, resolve))
    this.server = server
    this.endpointUrl = 'http://' + HOST + ':' + String((server.address() as AddressInfo).port)
    return this.endpointUrl
  }

  /** The endpoint to configure, valid once `start` has resolved. */
  get endpoint(): string {
    return this.endpointUrl
  }

  /** Closes the listeners and the keep-alive sockets a transport would otherwise hold open. */
  async stop(): Promise<void> {
    const server = this.server
    if (server === undefined) return
    this.server = undefined
    server.closeAllConnections()
    await new Promise<void>((resolve, reject) => {
      server.close((err) => (err ? reject(err) : resolve()))
    })
  }

  /** Requests recorded for one pathname and method, in arrival order. */
  requestsFor(method: string, path: string): RecordedRequest[] {
    return this.requests.filter((request) => request.method === method && request.path === path)
  }

  private pick(request: RecordedRequest): StubResponse {
    let reusable: Route | undefined
    for (const route of this.routes) {
      if (route.match.method !== request.method) continue
      if (route.match.path !== request.path) continue
      if (!matchesWantedQuery(route.match.query, request.query)) continue
      if (route.served < route.replies.length - 1) {
        const reply = route.replies[route.served]
        route.served += 1
        return reply
      }
      reusable ??= route
    }
    if (reusable !== undefined) return reusable.replies[reusable.replies.length - 1]
    return this.unrouted
  }

  private async answer(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const url = new URL(req.url ?? '/', 'http://' + HOST)
    const query: Record<string, string> = {}
    for (const [name, value] of url.searchParams) query[name] = value

    const request: RecordedRequest = {
      method: req.method ?? '',
      path: url.pathname,
      query,
      headers: flatten(req.headers),
      body: (await drain(req)).toString('utf8'),
    }
    this.requests.push(request)
    this.write(this.pick(request), res)
  }

  private write(reply: StubResponse, res: ServerResponse): void {
    const headers: Record<string, string> = { 'x-oss-request-id': 'mock-request-id', ...reply.headers }
    res.writeHead(reply.status ?? 200, headers)
    for (const chunk of reply.chunks ?? (reply.body === undefined ? [] : [reply.body])) {
      res.write(chunk)
    }
    res.end()
  }
}

import netstack from '@ohos.net.http'
import { Client, FixedDelayBackoff, StandardRetryer, StaticCredentialsProvider } from '../../../Index'
import type { ByteSink, ByteSinkFactory } from '../../../Index'
import { DEAD_PORT, STUB_PORT } from './stub-ports'

/** Where `scripts/harmony-loopback-server.mjs` listens, and the port it reserved without binding. */
export const STUB: string = 'http://127.0.0.1:' + STUB_PORT
export const DEAD: string = 'http://127.0.0.1:' + DEAD_PORT

export const BUCKET: string = 'mock-bucket'
export const OBJECT_BODY: string = 'hello from loopback'

/** The served body is two 256 KiB runs, each longer than one socket read carries. */
export const STREAM_HALF: number = 262144
export const STREAM_LENGTH: number = 524288

/**
 * A client with no injected transport, so the case runs over netstack, and a retry budget the 503 scenario
 * can consume. `endpoint` is a parameter because the refused case aims at a port nothing listens on.
 */
export function createClient(endpoint?: string): Client {
  return new Client({
    region: 'cn-hangzhou',
    endpoint: endpoint === undefined ? STUB : endpoint,
    credentialsProvider: new StaticCredentialsProvider('ak', 'sk'),
    retryer: new StandardRetryer({ maxAttempts: 3, backoff: new FixedDelayBackoff(0) }),
  })
}

/**
 * A `ByteSink` that keeps what the transport handed over, so a case can see how many bytes arrived, in
 * what order, and in how many writes -- how the body was split is netstack's, not the test's.
 */
export class CollectingSink implements ByteSink {
  readonly chunks: Uint8Array[] = []
  private bytes: number = 0

  write(chunk: Uint8Array): void {
    this.chunks.push(chunk)
    this.bytes += chunk.length
  }

  total(): number {
    return this.bytes
  }

  /** The character `at` bytes into what the sink took, or an empty string past the end. */
  charAt(at: number): string {
    let seen: number = 0
    for (const chunk of this.chunks) {
      if (at < seen + chunk.length) {
        return String.fromCharCode(chunk[at - seen])
      }
      seen += chunk.length
    }
    return ''
  }
}

/**
 * The `ByteSinkFactory` a case hands the client: one collector per attempt, plus what each attempt was told
 * about the body before it was asked for a sink. `oneShot` false is what lets a failed attempt be resent.
 */
export class CollectingSinkFactory implements ByteSinkFactory {
  readonly oneShot: boolean = false
  /** One entry per `supplier` call, in the order the attempts were made. */
  readonly sinks: CollectingSink[] = []
  /** What each response declared, or `-1` when it declared nothing. */
  readonly sizes: number[] = []

  supplier(size: number, _headers: Record<string, string>): ByteSink {
    const sink = new CollectingSink()
    this.sinks.push(sink)
    this.sizes.push(size)
    return sink
  }

  /** How many sinks were made, which is zero when the body never arrived. */
  made(): number {
    return this.sinks.length
  }

  /** The sink the last attempt was given. */
  last(): CollectingSink {
    return this.sinks[this.sinks.length - 1]
  }
}

/**
 * Issues a plain netstack GET, bypassing the SDK so a probe never counts as one of the SDK's attempts.
 * @param {string} url
 * @returns {Promise<string>}
 */
async function getText(url: string): Promise<string> {
  const request = netstack.createHttp()
  try {
    const response = await request.request(url, {
      method: netstack.RequestMethod.GET,
      expectDataType: netstack.HttpDataType.STRING,
      connectTimeout: 5000,
      readTimeout: 5000,
    })
    return typeof response.result === 'string' ? response.result : ''
  } finally {
    request.destroy()
  }
}

/**
 * Reads one number out of the stub's `count=N bytes=M` intake probe. The ArkTS side cannot see the request
 * the SDK built, so the counters the stub kept are what prove an attempt count or a replayed body.
 * @param {string} name
 * @param {string} method
 * @param {string} path
 * @param {string} [extra] More query pairs, such as the cursor that identifies one page.
 * @returns {Promise<number>}
 */
export async function probeCount(name: string, method: string, path: string, extra?: string): Promise<number> {
  const text = await getText(STUB + '/__count?method=' + method + '&path=' + path + (extra === undefined ? '' : extra))
  const at = text.indexOf(name + '=')
  if (at < 0) {
    return -1
  }
  const value = text.substring(at + name.length + 1)
  const space = value.indexOf(' ')
  return Number(space < 0 ? value : value.substring(0, space))
}

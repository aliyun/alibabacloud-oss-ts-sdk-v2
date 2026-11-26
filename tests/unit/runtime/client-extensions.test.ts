import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { PutObjectRequest } from '../../../src/models/object-basic.js'
import { getObjectToFile, putObjectFromFile } from '../../../src/runtime/client-extensions.harmony.js'
import type { ByteSinkFactory } from '../../../src/transport/types.js'
import type { OperationOptions } from '../../../src/types.js'
import { fileBytes, fileText, openHandles, resetFiles } from '../../fixtures/ohos-file-fs.js'
import { utf8Encode } from '../../../src/utils/bytes.js'

vi.mock('../../../src/runtime/harmony/file-content.js', () => ({
  fileBody: (path: string) =>
    Promise.resolve({
      path,
      oneShot: false,
      offset: 0,
      length: 4,
      source: () => ({ read: () => Promise.resolve(null) }),
    }),
}))

type ClientApi = Parameters<typeof getObjectToFile>[0]

interface DownloadRequest {
  bucket?: string
  key?: string
  sinkFactory?: ByteSinkFactory
}

interface Sent {
  opName: string
  input: DownloadRequest
  options?: OperationOptions
}

/** Stands in for a `Client`, with the transport's side of the bargain left to each case. */
function fakeClient(reply: (factory?: ByteSinkFactory) => Promise<unknown>): { client: ClientApi; sent: Sent[] } {
  const sent: Sent[] = []
  const api = {
    send(command: { opName: string; input: DownloadRequest }, options?: OperationOptions): Promise<unknown> {
      sent.push({ opName: command.opName, input: command.input, options })
      return reply(command.input.sinkFactory)
    },
  }
  return { client: api as unknown as ClientApi, sent }
}

function aborted(): { aborted: boolean; addEventListener: () => void; removeEventListener: () => void } {
  return { aborted: false, addEventListener: () => {}, removeEventListener: () => {} }
}

const request: DownloadRequest = { bucket: 'bucket', key: 'dir/key.txt' }

describe('OpenHarmony file operations', () => {
  beforeEach(() => {
    resetFiles()
  })

  it('uploads the file at the given path without the caller supplying its bytes', async () => {
    let body: { path?: string } | undefined
    const client = {
      send: (command: { input: PutObjectRequest }): Promise<object> => {
        const sent = command.input.body
        body = sent !== undefined && typeof sent === 'object' && 'path' in sent ? sent : undefined
        return Promise.resolve({})
      },
    } as Parameters<typeof putObjectFromFile>[0]

    await putObjectFromFile(client, { bucket: 'bucket', key: 'key' }, 'source.txt')

    expect(body?.path).toBe('source.txt')
  })

  it('streams a download into the file and returns no body', async () => {
    const client = fakeClient(async (factory) => {
      if (factory === undefined) throw new Error('the download came back with no sink to fill')
      const sink = factory.supplier(-1, {})
      await sink.write(utf8Encode('first '))
      await sink.write(utf8Encode('part'))
      await sink.close?.()
      return { body: 'left in memory' }
    })

    const result = await getObjectToFile(client.client, request, 'download.txt')

    expect(client.sent.length).toBe(1)
    expect(client.sent[0].opName).toBe('GetObject')
    expect(fileText('download.txt')).toBe('first part')
    // Those bytes are in the file now, so the result must not offer them a second time.
    expect(result.body).toBeUndefined()
    // The transport closes the sink it was given, so nothing is left holding the file open.
    expect(openHandles()).toBe(0)
  })

  // A factory is asked for a sink per attempt, and a fresh handle is what makes replaying safe.
  it('marks itself replayable and gives each attempt its own file', async () => {
    const client = fakeClient(async (factory) => {
      if (factory === undefined) throw new Error('the download came back with no sink to fill')
      expect(factory.oneShot).toBe(false)
      const first = factory.supplier(-1, {})
      await first.write(utf8Encode('written by the attempt that failed'))
      // The transport gives back the sink of the attempt it is abandoning before asking for the next.
      await first.close?.()
      const second = factory.supplier(-1, {})
      expect(second).not.toBe(first)
      await second.write(utf8Encode('rewritten'))
      await second.close?.()
      return {}
    })

    await getObjectToFile(client.client, request, 'replayed.txt')

    expect(fileText('replayed.txt')).toBe('rewritten')
    expect(openHandles()).toBe(0)
  })

  // A caller's `signal` and retry count have to survive the trip, and their request must not be edited.
  it('adds the sink factory to a copy of the request, leaving the caller request untouched', async () => {
    const signal = aborted()
    const options: OperationOptions = { retryMaxAttempts: 4, readWriteTimeoutMs: 1000, signal }
    const client = fakeClient(() => Promise.resolve({}))

    await getObjectToFile(client.client, request, 'kept.txt', options)

    expect(client.sent[0].input.sinkFactory).toBeDefined()
    expect(request.sinkFactory).toBeUndefined()
    expect(client.sent[0].options?.retryMaxAttempts).toBe(4)
    expect(client.sent[0].options?.readWriteTimeoutMs).toBe(1000)
    expect(client.sent[0].options?.signal).toBe(signal)
  })

  // No sink is made before the body arrives, so a failure leaves the path alone.
  it('leaves no file when the download fails', async () => {
    const failure = new Error('NoSuchKey')
    const client = fakeClient(() => Promise.reject(failure))

    await expect(getObjectToFile(client.client, request, 'failed.txt')).rejects.toBe(failure)

    expect(fileBytes('failed.txt')).toBeUndefined()
    expect(openHandles()).toBe(0)
  })
})

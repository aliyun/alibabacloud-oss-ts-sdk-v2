import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { Client } from '../../../../src/client.js'
import { StaticCredentialsProvider } from '../../../../src/credentials/static.js'
import { FileContent } from '../../../../src/runtime/node/file-content.js'
import { createMockTransport } from '../../../fixtures/mock-transport.js'

const dir = mkdtempSync(join(tmpdir(), 'oss-client-file-'))
const source = join(dir, 'source.txt')
const target = join(dir, 'target.txt')

function client(body?: string): { client: Client; transport: ReturnType<typeof createMockTransport> } {
  const transport = createMockTransport({ responses: [{ statusCode: 200, status: 'OK', headers: {}, body }] })
  return {
    client: new Client({
      region: 'cn-hangzhou',
      credentialsProvider: new StaticCredentialsProvider('ak', 'sk'),
      transport,
    }),
    transport,
  }
}

beforeAll(() => {
  writeFileSync(source, 'local source')
})

afterAll(() => {
  rmSync(dir, { recursive: true, force: true })
})

describe('Node Client file operations', () => {
  it('uploads a replayable file body through the core Client', async () => {
    const { client: subject, transport } = client()

    await subject.putObjectFromFile({ bucket: 'bucket', key: 'source.txt' }, source)

    expect(transport.requests[0].body).toBeInstanceOf(FileContent)
  })

  it('writes an object response into the target file and clears the result body', async () => {
    const { client: subject } = client('downloaded object')

    const result = await subject.getObjectToFile({ bucket: 'bucket', key: 'target.txt' }, target)

    expect(readFileSync(target, 'utf8')).toBe('downloaded object')
    expect(result.body).toBeUndefined()
  })
})

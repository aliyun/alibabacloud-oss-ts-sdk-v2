import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { FileContent, fileBody, readableBody } from '../../../../src/runtime/node/file-content.js'
import { BlobContent, blobBody } from '../../../../src/runtime/node/index.js'
import { StreamContent } from '../../../../src/transport/content.js'
import type { ByteSource } from '../../../../src/transport/types.js'
import { utf8Decode, utf8Encode } from '../../../../src/utils/bytes.js'

async function drain(source: ByteSource): Promise<Uint8Array> {
  const chunks: Uint8Array[] = []
  for (;;) {
    const chunk = await source.read()
    if (chunk === null) break
    chunks.push(chunk)
  }
  const bytes = new Uint8Array(chunks.reduce((sum, c) => sum + c.byteLength, 0))
  let at = 0
  for (const c of chunks) {
    bytes.set(c, at)
    at += c.byteLength
  }
  return bytes
}

describe('FileContent', () => {
  let dir: string
  let path: string

  beforeAll(() => {
    dir = mkdtempSync(join(tmpdir(), 'oss-file-content-'))
    path = join(dir, 'payload.txt')
    // 26 bytes, ascii, so byte offsets line up with characters.
    writeFileSync(path, 'abcdefghijklmnopqrstuvwxyz')
  })

  afterAll(() => {
    rmSync(dir, { recursive: true, force: true })
  })

  it('reads only its byte range and is replayable, never one-shot', async () => {
    const content = new FileContent(path, 2, 3)

    expect(content.oneShot).toBe(false)
    expect(content.length).toBe(3)
    expect(utf8Decode(await drain(content.source()))).toBe('cde')
    // A fresh cursor re-reads the same range.
    expect(utf8Decode(await drain(content.source()))).toBe('cde')
  })

  it('reads nothing for a zero-length range', async () => {
    expect(await new FileContent(path, 5, 0).source().read()).toBeNull()
  })

  it('fileBody stats the file to fill in the length when none is given', async () => {
    const body = await fileBody(path)
    expect(body).toBeInstanceOf(FileContent)
    expect(body.offset).toBe(0)
    expect(body.length).toBe(26)
  })

  it('fileBody measures the remainder from an offset', async () => {
    const body = await fileBody(path, { offset: 20 })
    expect(body.length).toBe(6)
    expect(utf8Decode(await drain(body.source()))).toBe('uvwxyz')
  })

  it('fileBody honours an explicit length without stat-ing', async () => {
    const body = await fileBody(path, { offset: 1, length: 4 })
    expect(utf8Decode(await drain(body.source()))).toBe('bcde')
  })
})

describe('readableBody', () => {
  async function* generate(...chunks: string[]): AsyncGenerator<Uint8Array> {
    for (const c of chunks) {
      await Promise.resolve()
      yield utf8Encode(c)
    }
  }

  it('wraps an async iterable as a one-shot StreamContent', async () => {
    const body = readableBody(generate('al', 'pha'))

    expect(body).toBeInstanceOf(StreamContent)
    expect(body.oneShot).toBe(true)
    expect(utf8Decode(await drain(body.source()))).toBe('alpha')
  })

  it('passes a declared length through and leaves it undefined otherwise', () => {
    expect(readableBody(generate(), { length: 5 }).length).toBe(5)
    expect(readableBody(generate()).length).toBeUndefined()
  })
})

describe('blobBody', () => {
  it('takes the length from blob.size and is replayable, never one-shot', async () => {
    const body = blobBody(new Blob(['alpha', ' beta']))

    expect(body).toBeInstanceOf(BlobContent)
    expect(body.oneShot).toBe(false)
    expect(body.length).toBe(10)
    expect(utf8Decode(await drain(body.source()))).toBe('alpha beta')
    // A fresh cursor re-reads the same bytes.
    expect(utf8Decode(await drain(body.source()))).toBe('alpha beta')
  })

  it('streams a File, which extends Blob', async () => {
    const body = blobBody(new File(['file bytes'], 'name.txt'))
    expect(body.length).toBe(10)
    expect(utf8Decode(await drain(body.source()))).toBe('file bytes')
  })

  it('reads nothing for an empty blob', async () => {
    expect(await blobBody(new Blob([])).source().read()).toBeNull()
  })

  it('cancel releases the cursor before it is drained', async () => {
    const source = blobBody(new Blob(['abc', 'def'])).source()
    expect(utf8Decode((await source.read()) ?? new Uint8Array(0))).toBe('abc')
    // Idempotent: cancelling an already-cancelled cursor is a no-op.
    await source.cancel?.()
    await source.cancel?.()
    expect(await source.read()).toBeNull()
  })
})

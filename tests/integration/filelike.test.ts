import { describe, expect, it } from 'vitest'
import { OssFs } from '../../src/runtime/node/fs.js'
import { DeleteObject, HeadObject, PutObject } from '../../src/index.js'
import { live, liveBucket, liveClient, uniqueKey } from './fixtures/live.js'

const bucket = liveBucket()

describe.skipIf(!live)('ReadOnlyFileHandle against the live service', () => {
  const client = liveClient()
  const prefix = uniqueKey('filelike')
  const key = prefix + '/hello.txt'
  const content = 'hello from the typescript sdk file-like path 世界'
  const encoder = new TextEncoder()
  const bytes = encoder.encode(content)

  it('PutObject creates the object the handle will read', async () => {
    const result = await client.send(
      new PutObject({ bucket, key, body: content, contentType: 'text/plain' }),
    )
    expect(result.statusCode).toBe(200)
  })

  it('openReadOnly reports object metadata via stat', async () => {
    const fs = new OssFs(client)
    const handle = await fs.openReadOnly(bucket, key)

    const info = await handle.stat()
    expect(info.name).toBe(`oss://${bucket}/${key}`)
    expect(info.size).toBe(bytes.byteLength)
    expect(info.contentType).toBe('text/plain')
    expect(info.etag).toBeTruthy()
    expect(info.lastModified).toBeInstanceOf(Date)

    await handle.close()
  })

  it('reads sequentially from the cursor', async () => {
    const fs = new OssFs(client)
    const handle = await fs.openReadOnly(bucket, key)

    const buf = new Uint8Array(64)
    const chunks: Uint8Array[] = []
    while (true) {
      const { bytesRead } = await handle.read(buf)
      if (bytesRead === 0) break
      chunks.push(buf.slice(0, bytesRead))
    }

    const total = chunks.reduce((sum, c) => sum + c.byteLength, 0)
    expect(total).toBe(bytes.byteLength)

    const decoder = new TextDecoder()
    const reconstructed = chunks.map((c) => decoder.decode(c)).join('')
    expect(reconstructed).toBe(content)

    await handle.close()
  })

  it('reads from a specific position without moving the cursor', async () => {
    const fs = new OssFs(client)
    const handle = await fs.openReadOnly(bucket, key)

    const decoder = new TextDecoder()
    const buf = new Uint8Array(64)

    // Read the first five bytes from position 0 explicitly.
    const r1 = await handle.read(buf, 0, 5, 0)
    expect(r1.bytesRead).toBe(5)
    expect(decoder.decode(buf.slice(0, 5))).toBe('hello')

    // Cursor was not moved, so a positional-less read still starts at 0.
    const r2 = await handle.read(buf, 0, 5)
    expect(r2.bytesRead).toBe(5)
    expect(decoder.decode(buf.slice(0, 5))).toBe('hello')

    await handle.close()
  })

  it('supports the options object form', async () => {
    const fs = new OssFs(client)
    const handle = await fs.openReadOnly(bucket, key)

    const decoder = new TextDecoder()
    const buf = new Uint8Array(64)
    const { bytesRead } = await handle.read({ buffer: buf, offset: 0, length: 5, position: 6 })
    expect(bytesRead).toBe(5)
    expect(decoder.decode(buf.slice(0, 5))).toBe('from ')

    await handle.close()
  })

  it('respects the initial offset option', async () => {
    const fs = new OssFs(client)
    const handle = await fs.openReadOnly(bucket, key, { offset: 6 })

    const decoder = new TextDecoder()
    const buf = new Uint8Array(64)
    const { bytesRead } = await handle.read(buf, 0, 5)
    expect(bytesRead).toBe(5)
    expect(decoder.decode(buf.slice(0, 5))).toBe('from ')

    await handle.close()
  })

  it('streams the whole object through createReadStream', async () => {
    const fs = new OssFs(client)
    const handle = await fs.openReadOnly(bucket, key)

    const stream = await handle.createReadStream({ highWaterMark: 16 })
    const chunks: Uint8Array[] = []
    for await (const chunk of stream) {
      chunks.push(chunk as Uint8Array)
    }

    const decoder = new TextDecoder()
    const reconstructed = chunks.map((c) => decoder.decode(c)).join('')
    expect(reconstructed).toBe(content)

    await expect(handle.read(new Uint8Array(1))).rejects.toThrow('ReadOnlyFileHandle is closed')
  })

  it('streams the whole object through readableWebStream', async () => {
    const fs = new OssFs(client)
    const handle = await fs.openReadOnly(bucket, key)

    const webStream = await handle.readableWebStream({ highWaterMark: 16 })
    const reader = webStream.getReader()
    const chunks: Uint8Array[] = []
    while (true) {
      const { value, done } = await reader.read()
      if (done) break
      chunks.push(value)
    }

    const decoder = new TextDecoder()
    const reconstructed = chunks.map((c) => decoder.decode(c)).join('')
    expect(reconstructed).toBe(content)

    await expect(handle.read(new Uint8Array(1))).rejects.toThrow('ReadOnlyFileHandle is closed')
  })

  it('cleans up the test object', async () => {
    await client.send(new DeleteObject({ bucket, key }))

    await expect(client.send(new HeadObject({ bucket, key }))).rejects.toThrow()
  })
})

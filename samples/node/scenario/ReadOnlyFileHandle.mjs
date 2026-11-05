// Demonstrates: Open an object as a read-only file handle and read it like a local file.
import * as process from 'node:process'
import * as oss from '@alicloud/oss-v2'
import { OssFs } from '@alicloud/oss-v2/runtime/node/fs'
import { bucket, createClient, report } from '../SampleConfig.mjs'

const key = process.argv[2] ?? 'sample/hello.txt'

try {
  const fs = new OssFs(createClient())
  const handle = await fs.openReadOnly(bucket(), key)

  const info = await handle.stat()
  console.log('opened ' + key)
  console.log('  name:          ' + info.name)
  console.log('  size:          ' + String(info.size))
  console.log('  contentType:   ' + (info.contentType ?? ''))
  console.log('  etag:          ' + (info.etag ?? ''))
  console.log('  lastModified:  ' + (info.lastModified?.toISOString() ?? ''))

  // Read the first chunk from an explicit position, leaving the cursor unchanged.
  const peek = new Uint8Array(64)
  const peekResult = await handle.read(peek, 0, peek.byteLength, 0)
  console.log('  peek bytes:    ' + String(peekResult.bytesRead))

  // Read the whole object sequentially from the current cursor.
  const chunks = []
  const buf = new Uint8Array(64 * 1024)
  while (true) {
    const { bytesRead } = await handle.read(buf)
    if (bytesRead === 0) break
    chunks.push(buf.slice(0, bytesRead))
  }

  const total = chunks.reduce((sum, c) => sum + c.byteLength, 0)
  console.log('  total read:    ' + String(total))

  await handle.close()
} catch (error) {
  report(error)
}

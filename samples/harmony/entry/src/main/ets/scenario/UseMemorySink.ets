// Demonstrates: Download into a buffer you allocated, so the download is bounded by what you reserved
// rather than by the 100 MiB a buffered body stops at here.
import { GetObject, HeadObject, MemorySinkFactory } from '@alicloud/oss-v2'
import { bucket, createClient, report } from '../SampleConfig'

export async function run(key: string = 'sample/hello.txt'): Promise<void> {
  try {
    const client = createClient()

    // Ask how long the object is before allocating: `supplier` refuses a declared length that will not fit,
    // which settles the attempt before a single byte is pulled.
    const head = await client.send(new HeadObject({ bucket: bucket(), key: key }))
    const size: number = head.contentLength ?? 0
    const buffer = new Uint8Array(size)

    // `{ offset: n }` fills from n and leaves the bytes before it alone. Every attempt refills its own range,
    // so a retry needs nothing from you.
    const factory = new MemorySinkFactory(buffer)
    const result = await client.send(new GetObject({ bucket: bucket(), key: key, sinkFactory: factory }))

    console.log('downloaded ' + key + ' into memory')
    console.log('  statusCode: ' + result.statusCode)
    console.log('  declared:   ' + String(size) + ' bytes')
    console.log('  written:    ' + String(factory.written) + ' of ' + String(buffer.byteLength) + ' bytes')
    // The body went to the buffer as it arrived, so the result hands back none.
    console.log('  body:       ' + String((await result.body?.bytes())?.length ?? 0) + ' bytes on the result')

    const limit = 16
    let preview = ''
    for (let i = 0; i < Math.min(limit, factory.written); i++) {
      preview += String.fromCharCode(buffer[i])
    }
    console.log('  first bytes: ' + preview)
  } catch (error) {
    report(error)
  }
}

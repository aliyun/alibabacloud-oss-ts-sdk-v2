// Demonstrates: Write a download into a file as it arrives, range by range, sequentially or concurrently.
import { FileSinkFactory, GetObject, HeadObject } from '@alicloud/oss-v2'
import type { Client } from '@alicloud/oss-v2'
import fileIo from '@ohos.file.fs'
import { bucket, createClient, filesDir, report } from '../SampleConfig'

/** How much of the object one ranged request carries. */
const partSize = 256 * 1024

/** One part of the object: where its bytes start in the file and how many they are. */
class Part {
  readonly start: number
  readonly size: number

  constructor(start: number, size: number) {
    this.start = start
    this.size = size
  }
}

function partsOf(size: number): Array<Part> {
  const parts: Array<Part> = []
  let at = 0
  while (at < size) {
    const length = Math.min(partSize, size - at)
    parts.push(new Part(at, length))
    at += length
  }
  return parts
}

/** Empties the file first: a positioned write never truncates, so an earlier run's tail would survive. */
function createFile(path: string): void {
  const file = fileIo.openSync(path, fileIo.OpenMode.READ_WRITE | fileIo.OpenMode.CREATE | fileIo.OpenMode.TRUNC)
  fileIo.closeSync(file)
}

/** The file's length, or `-1` when nothing was written to it. */
function sizeOf(path: string): number {
  return fileIo.accessSync(path) ? fileIo.statSync(path).size : -1
}

/**
 * Fetches one part into `path` at its own position. The request and the sink have to agree: the sink
 * writes where it was told to, not where the response says its bytes begin.
 */
async function fetchPart(client: Client, key: string, path: string, part: Part): Promise<void> {
  await client.send(new GetObject({
    bucket: bucket(),
    key: key,
    range: 'bytes=' + String(part.start) + '-' + String(part.start + part.size - 1),
    sinkFactory: new FileSinkFactory(path, { offset: part.start }),
  }))
}

export async function run(key: string = 'sample/hello.txt', dir: string = filesDir()): Promise<void> {
  try {
    const client = createClient()
    const size = (await client.send(new HeadObject({ bucket: bucket(), key: key }))).contentLength ?? 0
    console.log(key + ' is ' + String(size) + ' bytes')

    // One request for the whole object. Every chunk goes to the file the moment it arrives, so the transfer
    // is bounded by what is in flight rather than by the 100 MiB a buffered body stops at. This is what
    // `getObjectToFile` does; naming the sink yourself is what makes the ranges below possible.
    const whole = dir + '/whole.bin'
    await client.send(new GetObject({ bucket: bucket(), key: key, sinkFactory: new FileSinkFactory(whole) }))
    console.log('whole:      ' + String(sizeOf(whole)) + ' bytes')

    // Parts in order. With an `offset` each request rewrites only its own range, so the file grows part by
    // part and the bytes outside a range stay as the earlier parts left them.
    const sequential = dir + '/sequential.bin'
    createFile(sequential)
    for (const part of partsOf(size)) {
      await fetchPart(client, key, sequential, part)
    }
    console.log('sequential: ' + String(sizeOf(sequential)) + ' bytes')

    // The same parts at once. Nothing is shared between them: one sink and one file handle per attempt, and
    // every write names its own position, so the order they land in does not matter. Each request in flight
    // holds up to 8 MiB before the file catches up, so a real download bounds how many run together.
    const concurrent = dir + '/concurrent.bin'
    createFile(concurrent)
    const pending: Array<Promise<void>> = []
    for (const part of partsOf(size)) {
      pending.push(fetchPart(client, key, concurrent, part))
    }
    await Promise.all(pending)
    console.log('concurrent: ' + String(sizeOf(concurrent)) + ' bytes')

    // A run that failed part way leaves a file whose gaps read back as zeros, so a length short of this is
    // the signal to resume from there rather than to trust the file.
    console.log('expected:   ' + String(size) + ' bytes')
  } catch (error) {
    report(error)
  }
}

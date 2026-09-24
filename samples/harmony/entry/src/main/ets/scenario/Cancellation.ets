// Demonstrates: Cancel an in-flight request and recognise CanceledError.
// OpenHarmony has no global `AbortController`.
import { GetObject, CanceledError, OperationError } from '@alicloud/oss-v2'
import type { AbortSignalLike } from '@alicloud/oss-v2'
import { bucket, createClient, report } from '../SampleConfig'

class Deadline implements AbortSignalLike {
  private fired = false
  private listeners: Array<() => void> = []
  private readonly timer: number

  constructor(afterMs: number) {
    this.timer = setTimeout(() => this.abort(), afterMs)
  }

  get aborted(): boolean {
    return this.fired
  }

  addEventListener(type: 'abort', listener: () => void): void {
    this.listeners.push(listener)
  }

  removeEventListener(type: 'abort', listener: () => void): void {
    const at = this.listeners.indexOf(listener)
    if (at >= 0) this.listeners.splice(at, 1)
  }

  private abort(): void {
    if (this.fired) return
    this.fired = true
    for (const listener of this.listeners) listener()
  }

  clear(): void {
    clearTimeout(this.timer)
  }
}

export async function run(key: string = 'sample/hello.txt'): Promise<void> {
  const deadline = new Deadline(50)
  try {
    const result = await createClient().send(new GetObject({ bucket: bucket(), key: key }), {
      signal: deadline,
    })
    deadline.clear()
    console.log('finished before the deadline: ' + key + ' (' + result.contentLength + ' B)')
  } catch (error) {
    deadline.clear()
    const canceled = error instanceof CanceledError
      ? error
      : error instanceof OperationError
        ? error.contains((inner) => inner instanceof CanceledError)
        : undefined
    if (canceled instanceof CanceledError) {
      console.log('cancelled: the 50ms deadline fired before the request completed')
      return
    }
    report(error)
  }
}

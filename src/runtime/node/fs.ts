import type { Client } from '../../client.js'
import { ReadOnlyFileHandle, type OpenOptions } from './fs-promises.js'

/** Input for the object form of {@link OssFs.openReadOnly}. */
export interface OpenReadOnlyInput extends OpenOptions {
  bucket: string
  key: string
}

/**
 * A Node-style file system facade over an OSS bucket.
 *
 * Use this when you need `fs.promises.FileHandle`-like access to OSS objects
 * from desktop or server applications.
 *
 * @example
 * ```ts
 * import { OssFs } from '@alicloud/oss-v2/runtime/node/fs'
 *
 * const fs = new OssFs(client)
 * const handle = await fs.openReadOnly('bucket', 'key')
 * const buf = new Uint8Array(1024)
 * const { bytesRead } = await handle.read(buf, 0, 1024, 0)
 * await handle.close()
 * ```
 */
export class OssFs {
  private readonly client: Client

  constructor(client: Client) {
    this.client = client
  }

  /**
   * Opens a read-only handle on an object.
   *
   * Positional form: `openReadOnly(bucket, key, options)`.
   * Object form: `openReadOnly({ bucket, key, ...options })`.
   *
   * The returned handle supports both positional read arguments and the options
   * object form used by `fs.promises.FileHandle.read`.
   */
  async openReadOnly(bucket: string, key: string, options?: OpenOptions): Promise<ReadOnlyFileHandle>
  async openReadOnly(input: OpenReadOnlyInput): Promise<ReadOnlyFileHandle>
  async openReadOnly(
    bucketOrInput: string | OpenReadOnlyInput,
    key?: string,
    options?: OpenOptions,
  ): Promise<ReadOnlyFileHandle> {
    if (typeof bucketOrInput === 'string') {
      return this._open(bucketOrInput, key as string, options)
    }
    const { bucket, key: inputKey, ...inputOptions } = bucketOrInput
    return this._open(bucket, inputKey, inputOptions)
  }

  private async _open(bucket: string, key: string, options?: OpenOptions): Promise<ReadOnlyFileHandle> {
    const handle = new ReadOnlyFileHandle(this.client, bucket, key, options)
    await handle.stat()
    return handle
  }
}

export {
  ObjectFileHandle,
  ReadOnlyFileHandle,
  type OpenOptions,
  type ObjectInfo,
  type ReadOptions,
} from './fs-promises.js'
export type { PrefetchOptions, ReadStreamOptions } from './fs-streams.js'

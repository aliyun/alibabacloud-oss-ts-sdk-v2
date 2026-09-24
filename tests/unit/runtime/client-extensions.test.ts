import { describe, expect, it } from 'vitest'
import { NotSupportedError } from '../../../src/error/types.js'
import { getObjectToFile, putObjectFromFile } from '../../../src/runtime/client-extensions.harmony.js'

const client = {} as Parameters<typeof putObjectFromFile>[0]

describe('OpenHarmony file operations', () => {
  it('rejects both local-file operations as unsupported', async () => {
    await expect(putObjectFromFile(client, { bucket: 'bucket', key: 'key' }, 'source.txt')).rejects.toBeInstanceOf(
      NotSupportedError,
    )
    await expect(getObjectToFile(client, { bucket: 'bucket', key: 'key' }, 'target.txt')).rejects.toBeInstanceOf(
      NotSupportedError,
    )
  })
})

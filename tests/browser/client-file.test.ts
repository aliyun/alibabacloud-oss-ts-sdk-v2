import { describe, expect, it } from 'vitest'
import { Client } from '../../src/client.js'
import { NotSupportedError } from '../../src/error/types.js'

describe('Browser Client file operations', () => {
  it('rejects local-file operations as unsupported', async () => {
    const client = new Client({})

    await expect(client.putObjectFromFile({ bucket: 'bucket', key: 'key' }, 'source.txt')).rejects.toBeInstanceOf(
      NotSupportedError,
    )
    await expect(client.getObjectToFile({ bucket: 'bucket', key: 'key' }, 'target.txt')).rejects.toBeInstanceOf(
      NotSupportedError,
    )
  })
})

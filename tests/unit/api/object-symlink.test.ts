import { describe, expect, it } from 'vitest'
import { GetSymlink, PutSymlink } from '../../../src/api/object-symlink.js'
import { ParamRequiredError } from '../../../src/error/types.js'
import type { ResponseBody } from '../../../src/transport/types.js'
import type { OperationInput, OperationOutput } from '../../../src/types.js'
import { SpyBody } from '../../fixtures/mock-transport.js'
import { headersOf } from '../../fixtures/serialized-headers.js'

const input: OperationInput = { opName: 'Test', method: 'GET' }

function output(headers: Record<string, string>, body?: ResponseBody, statusCode = 200): OperationOutput {
  return { input, status: 'OK', statusCode, headers, body }
}

describe('PutSymlink serialize', () => {
  it('maps the target and the optional headers to their wire names', async () => {
    const command = new PutSymlink({
      bucket: 'bucket-1',
      key: 'link.txt',
      symlinkTarget: 'dir/target.txt',
      objectAcl: 'private',
      storageClass: 'IA',
      forbidOverwrite: true,
    })

    const serialized = await command.serialize(command.input)

    expect(serialized.opName).toBe('PutSymlink')
    expect(serialized.method).toBe('PUT')
    expect(serialized.bucket).toBe('bucket-1')
    expect(serialized.key).toBe('link.txt')
    expect(serialized.parameters).toEqual({ symlink: '' })
    expect(headersOf(serialized)).toEqual({
      'x-oss-symlink-target': 'dir/target.txt',
      'x-oss-object-acl': 'private',
      'x-oss-storage-class': 'IA',
      'x-oss-forbid-overwrite': 'true',
      'Content-Type': 'application/xml',
      'Content-MD5': '1B2M2Y8AsgTpgAmY7PhCfg==',
    })
  })

  it('rejects a missing bucket, key, or target by name', () => {
    const noTarget = new PutSymlink({ bucket: 'bucket-1', key: 'k' })
    expect(() => noTarget.serialize(noTarget.input)).toThrow(ParamRequiredError)
    expect(() => noTarget.serialize(noTarget.input)).toThrow('missing required field, symlinkTarget')
  })
})

describe('PutSymlink deserialize', () => {
  it('lifts the version id from the header and drains the body', async () => {
    const body = new SpyBody()
    const command = new PutSymlink({ bucket: 'bucket-1', key: 'k', symlinkTarget: 't' })
    const result = await command.deserialize(output({ 'x-oss-version-id': 'v2' }, body))
    expect(result.versionId).toBe('v2')
    expect(body.reads).toBe(1)
  })
})

describe('GetSymlink serialize', () => {
  it('sends the symlink sub-resource and the version id', async () => {
    const command = new GetSymlink({ bucket: 'bucket-1', key: 'link.txt', versionId: 'v1' })
    const serialized = await command.serialize(command.input)
    expect(serialized.opName).toBe('GetSymlink')
    expect(serialized.method).toBe('GET')
    expect(serialized.parameters).toEqual({ symlink: '', versionId: 'v1' })
    expect(headersOf(serialized)).toEqual({
      'Content-Type': 'application/xml',
      'Content-MD5': '1B2M2Y8AsgTpgAmY7PhCfg==',
    })
  })

  it('rejects a missing key by name', () => {
    const command = new GetSymlink({ bucket: 'bucket-1' })
    expect(() => command.serialize(command.input)).toThrow('missing required field, key')
  })
})

describe('GetSymlink deserialize', () => {
  it('reads the target and version id from the headers', async () => {
    const body = new SpyBody()
    const command = new GetSymlink({ bucket: 'bucket-1', key: 'k' })
    const result = await command.deserialize(
      output({ 'x-oss-symlink-target': 'dir/target.txt', 'x-oss-version-id': 'v2' }, body),
    )
    expect(result.symlinkTarget).toBe('dir/target.txt')
    expect(result.versionId).toBe('v2')
    expect(body.reads).toBe(1)
  })
})

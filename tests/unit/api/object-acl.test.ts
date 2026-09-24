import { describe, expect, it } from 'vitest'
import { GetObjectAcl, PutObjectAcl } from '../../../src/api/object-acl.js'
import { DeserializationError, ParamRequiredError } from '../../../src/error/types.js'
import type { ResponseBody } from '../../../src/transport/types.js'
import type { OperationInput, OperationOutput } from '../../../src/types.js'
import { SpyBody, textBody } from '../../fixtures/mock-transport.js'
import { headersOf } from '../../fixtures/serialized-headers.js'

const input: OperationInput = { opName: 'Test', method: 'GET' }

function output(headers: Record<string, string>, body?: ResponseBody, statusCode = 200): OperationOutput {
  return { input, status: 'OK', statusCode, headers, body }
}

describe('PutObjectAcl serialize', () => {
  it('sends the acl header, the sub-resource, and the version id', async () => {
    const command = new PutObjectAcl({
      bucket: 'bucket-1',
      key: 'dir/file.txt',
      objectAcl: 'public-read',
      versionId: 'v1',
    })

    const serialized = await command.serialize(command.input)

    expect(serialized.opName).toBe('PutObjectAcl')
    expect(serialized.method).toBe('PUT')
    expect(serialized.bucket).toBe('bucket-1')
    expect(serialized.key).toBe('dir/file.txt')
    expect(serialized.parameters).toEqual({ acl: '', versionId: 'v1' })
    expect(headersOf(serialized)).toEqual({
      'x-oss-object-acl': 'public-read',
      'Content-Type': 'application/xml',
      'Content-MD5': '1B2M2Y8AsgTpgAmY7PhCfg==',
    })
  })

  it('rejects a missing bucket, key, or acl by name', () => {
    const noAcl = new PutObjectAcl({ bucket: 'bucket-1', key: 'k' })
    expect(() => noAcl.serialize(noAcl.input)).toThrow(ParamRequiredError)
    expect(() => noAcl.serialize(noAcl.input)).toThrow('missing required field, objectAcl')

    const noKey = new PutObjectAcl({ bucket: 'bucket-1', objectAcl: 'private' })
    expect(() => noKey.serialize(noKey.input)).toThrow('missing required field, key')
  })
})

describe('PutObjectAcl deserialize', () => {
  it('lifts the version id from the header and drains the body', async () => {
    const body = new SpyBody()
    const command = new PutObjectAcl({ bucket: 'bucket-1', key: 'k', objectAcl: 'private' })
    const result = await command.deserialize(output({ 'x-oss-version-id': 'v2' }, body))
    expect(result.versionId).toBe('v2')
    expect(body.reads).toBe(1)
  })
})

describe('GetObjectAcl serialize', () => {
  it('sends the acl sub-resource and the version id', async () => {
    const command = new GetObjectAcl({ bucket: 'bucket-1', key: 'dir/file.txt', versionId: 'v1' })
    const serialized = await command.serialize(command.input)
    expect(serialized.opName).toBe('GetObjectAcl')
    expect(serialized.method).toBe('GET')
    expect(serialized.parameters).toEqual({ acl: '', versionId: 'v1' })
    expect(headersOf(serialized)).toEqual({
      'Content-Type': 'application/xml',
      'Content-MD5': '1B2M2Y8AsgTpgAmY7PhCfg==',
    })
  })

  it('rejects a missing key by name', () => {
    const command = new GetObjectAcl({ bucket: 'bucket-1' })
    expect(() => command.serialize(command.input)).toThrow('missing required field, key')
  })
})

describe('GetObjectAcl deserialize', () => {
  it('reads the owner and the grant', async () => {
    const command = new GetObjectAcl({ bucket: 'bucket-1', key: 'k' })
    const result = await command.deserialize(
      output(
        { 'x-oss-request-id': 'req-1' },
        textBody(
          '<?xml version="1.0" encoding="UTF-8"?><AccessControlPolicy>' +
            '<Owner><ID>1000</ID><DisplayName>owner</DisplayName></Owner>' +
            '<AccessControlList><Grant>public-read</Grant></AccessControlList></AccessControlPolicy>',
        ),
      ),
    )
    expect(result.requestId).toBe('req-1')
    expect(result.accessControlPolicy?.owner?.id).toBe('1000')
    expect(result.accessControlPolicy?.owner?.displayName).toBe('owner')
    expect(result.accessControlPolicy?.accessControlList?.grant).toBe('public-read')
  })

  it('rejects a foreign root element', async () => {
    const command = new GetObjectAcl({ bucket: 'bucket-1', key: 'k' })
    await expect(command.deserialize(output({}, textBody('<Other/>')))).rejects.toThrow(DeserializationError)
  })
})

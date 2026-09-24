import { describe, expect, it } from 'vitest'
import { DeleteObjectTagging, GetObjectTagging, PutObjectTagging } from '../../../src/api/object-tagging.js'
import { DeserializationError, ParamRequiredError } from '../../../src/error/types.js'
import type { ResponseBody } from '../../../src/transport/types.js'
import type { OperationInput, OperationOutput } from '../../../src/types.js'
import { SpyBody, textBody } from '../../fixtures/mock-transport.js'
import { headersOf } from '../../fixtures/serialized-headers.js'

const input: OperationInput = { opName: 'Test', method: 'GET' }

function output(headers: Record<string, string>, body?: ResponseBody, statusCode = 200): OperationOutput {
  return { input, status: 'OK', statusCode, headers, body }
}

describe('PutObjectTagging serialize', () => {
  it('builds the tag set body and signs its MD5', async () => {
    const command = new PutObjectTagging({
      bucket: 'bucket-1',
      key: 'dir/file.txt',
      versionId: 'v1',
      tagging: {
        tagSet: {
          tags: [
            { key: 'k1', value: 'v1' },
            { key: 'k2', value: 'v2' },
          ],
        },
      },
    })

    const serialized = await command.serialize(command.input)

    expect(serialized.opName).toBe('PutObjectTagging')
    expect(serialized.method).toBe('PUT')
    expect(serialized.bucket).toBe('bucket-1')
    expect(serialized.key).toBe('dir/file.txt')
    expect(serialized.parameters).toEqual({ tagging: '', versionId: 'v1' })
    expect(serialized.body).toBe(
      '<?xml version="1.0" encoding="UTF-8"?><Tagging><TagSet>' +
        '<Tag><Key>k1</Key><Value>v1</Value></Tag>' +
        '<Tag><Key>k2</Key><Value>v2</Value></Tag></TagSet></Tagging>',
    )
    expect(headersOf(serialized)).toEqual({
      'Content-Type': 'application/xml',
      'Content-MD5': 'GeL2Fp1pEoteXhFeMALE5A==',
    })
  })

  it('sends an empty-body MD5 and no body when no tagging is given', async () => {
    const command = new PutObjectTagging({ bucket: 'bucket-1', key: 'k' })
    const serialized = await command.serialize(command.input)
    expect(serialized.body).toBeUndefined()
    expect(headersOf(serialized)).toEqual({
      'Content-Type': 'application/xml',
      'Content-MD5': '1B2M2Y8AsgTpgAmY7PhCfg==',
    })
    expect(serialized.parameters).toEqual({ tagging: '' })
  })

  it('rejects a missing bucket or key by name', () => {
    const noBucket = new PutObjectTagging({ key: 'k' })
    expect(() => noBucket.serialize(noBucket.input)).toThrow(ParamRequiredError)
    expect(() => noBucket.serialize(noBucket.input)).toThrow('missing required field, bucket')
  })
})

describe('PutObjectTagging deserialize', () => {
  it('lifts the version id from the header and drains the body', async () => {
    const body = new SpyBody()
    const command = new PutObjectTagging({ bucket: 'bucket-1', key: 'k' })
    const result = await command.deserialize(output({ 'x-oss-version-id': 'v2' }, body))
    expect(result.versionId).toBe('v2')
    expect(body.reads).toBe(1)
  })
})

describe('GetObjectTagging serialize', () => {
  it('sends the tagging sub-resource with an empty-body MD5', async () => {
    const command = new GetObjectTagging({ bucket: 'bucket-1', key: 'dir/file.txt' })
    const serialized = await command.serialize(command.input)
    expect(serialized.opName).toBe('GetObjectTagging')
    expect(serialized.method).toBe('GET')
    expect(serialized.parameters).toEqual({ tagging: '' })
    expect(headersOf(serialized)).toEqual({
      'Content-Type': 'application/xml',
      'Content-MD5': '1B2M2Y8AsgTpgAmY7PhCfg==',
    })
  })
})

describe('GetObjectTagging deserialize', () => {
  it('reads every tag in the set', async () => {
    const command = new GetObjectTagging({ bucket: 'bucket-1', key: 'k' })
    const result = await command.deserialize(
      output(
        {},
        textBody(
          '<?xml version="1.0" encoding="UTF-8"?><Tagging><TagSet>' +
            '<Tag><Key>k1</Key><Value>v1</Value></Tag>' +
            '<Tag><Key>k2</Key><Value>v2</Value></Tag></TagSet></Tagging>',
        ),
      ),
    )
    expect(result.tagging?.tagSet?.tags).toEqual([
      { key: 'k1', value: 'v1' },
      { key: 'k2', value: 'v2' },
    ])
  })

  it('rejects a foreign root element', async () => {
    const command = new GetObjectTagging({ bucket: 'bucket-1', key: 'k' })
    await expect(command.deserialize(output({}, textBody('<Other/>')))).rejects.toThrow(DeserializationError)
  })
})

describe('DeleteObjectTagging serialize', () => {
  it('sends a DELETE against the tagging sub-resource', async () => {
    const command = new DeleteObjectTagging({ bucket: 'bucket-1', key: 'dir/file.txt', versionId: 'v1' })
    const serialized = await command.serialize(command.input)
    expect(serialized.opName).toBe('DeleteObjectTagging')
    expect(serialized.method).toBe('DELETE')
    expect(serialized.parameters).toEqual({ tagging: '', versionId: 'v1' })
    expect(headersOf(serialized)).toEqual({
      'Content-Type': 'application/xml',
      'Content-MD5': '1B2M2Y8AsgTpgAmY7PhCfg==',
    })
  })

  it('rejects a missing key by name', () => {
    const command = new DeleteObjectTagging({ bucket: 'bucket-1' })
    expect(() => command.serialize(command.input)).toThrow('missing required field, key')
  })
})

describe('DeleteObjectTagging deserialize', () => {
  it('reports the status and drains the body', async () => {
    const body = new SpyBody()
    const command = new DeleteObjectTagging({ bucket: 'bucket-1', key: 'k' })
    const result = await command.deserialize(output({ 'x-oss-request-id': 'req-1' }, body, 204))
    expect(result.statusCode).toBe(204)
    expect(result.requestId).toBe('req-1')
    expect(body.reads).toBe(1)
  })
})

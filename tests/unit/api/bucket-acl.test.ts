import { describe, expect, it } from 'vitest'
import { GetBucketAcl, PutBucketAcl } from '../../../src/api/bucket-acl.js'
import { ParamRequiredError } from '../../../src/error/types.js'
import { SpyBody, textBody } from '../../fixtures/mock-transport.js'
import { headersOf } from '../../fixtures/serialized-headers.js'
import type { OperationOutput } from '../../../src/types.js'

const EMPTY_BODY_MD5 = '1B2M2Y8AsgTpgAmY7PhCfg=='

function output(body: string): OperationOutput {
  return {
    input: { opName: 'Test', method: 'GET' },
    status: 'OK',
    statusCode: 200,
    headers: { 'x-oss-request-id': 'req-1' },
    body: textBody(body),
  }
}

describe('PutBucketAcl serialize', () => {
  it('sends the acl sub-resource, the acl header, the XML content type and the empty-body MD5', async () => {
    const command = new PutBucketAcl({ bucket: 'bucket-1', acl: 'public-read' })
    const serialized = await command.serialize(command.input)

    expect(serialized.opName).toBe('PutBucketAcl')
    expect(serialized.method).toBe('PUT')
    expect(serialized.bucket).toBe('bucket-1')
    expect(serialized.parameters).toEqual({ acl: '' })
    expect(headersOf(serialized)).toEqual({
      'x-oss-acl': 'public-read',
      'Content-Type': 'application/xml',
      'Content-MD5': EMPTY_BODY_MD5,
    })
    expect(serialized.body).toBeUndefined()
  })

  it('rejects a missing bucket', () => {
    const command = new PutBucketAcl({ acl: 'private' })
    expect(() => command.serialize(command.input)).toThrow(ParamRequiredError)
    expect(() => command.serialize(command.input)).toThrow('missing required field, bucket')
  })

  it('rejects a missing acl, which without it the operation is a no-op', () => {
    const command = new PutBucketAcl({ bucket: 'bucket-1' })
    expect(() => command.serialize(command.input)).toThrow('missing required field, acl')
  })

  it('lets the modelled acl win over the same header set by hand, whatever its case', async () => {
    const command = new PutBucketAcl({
      bucket: 'bucket-1',
      acl: 'private',
      headers: { 'X-OSS-ACL': 'public-read-write', 'x-oss-not-modelled': 'kept' },
    })

    const serialized = await command.serialize(command.input)

    expect(headersOf(serialized)).toEqual({
      'x-oss-acl': 'private',
      'x-oss-not-modelled': 'kept',
      'Content-Type': 'application/xml',
      'Content-MD5': EMPTY_BODY_MD5,
    })
  })
})

describe('PutBucketAcl deserialize', () => {
  it('reads the common fields and drains the body', async () => {
    const command = new PutBucketAcl({ bucket: 'bucket-1', acl: 'private' })
    const body = new SpyBody()

    const result = await command.deserialize({
      input: { opName: 'Test', method: 'PUT' },
      status: 'OK',
      statusCode: 200,
      headers: { 'x-oss-request-id': 'req-1' },
      body,
    })

    expect(result).toEqual({ status: 'OK', statusCode: 200, requestId: 'req-1', headers: { 'x-oss-request-id': 'req-1' } })
    expect(body.reads).toBe(1)
  })
})

describe('GetBucketAcl serialize', () => {
  it('sends a bodyless acl sub-resource GET with the empty-body MD5', async () => {
    const command = new GetBucketAcl({ bucket: 'bucket-1' })
    const serialized = await command.serialize(command.input)

    expect(serialized.opName).toBe('GetBucketAcl')
    expect(serialized.method).toBe('GET')
    expect(serialized.parameters).toEqual({ acl: '' })
    expect(headersOf(serialized)).toEqual({ 'Content-MD5': EMPTY_BODY_MD5 })
  })

  it('rejects a missing bucket', () => {
    const command = new GetBucketAcl({})
    expect(() => command.serialize(command.input)).toThrow('missing required field, bucket')
  })
})

describe('GetBucketAcl deserialize', () => {
  it('reads the owner and the grant', async () => {
    const command = new GetBucketAcl({ bucket: 'bucket-1' })
    const result = await command.deserialize(
      output(
        '<AccessControlPolicy><Owner><ID>1234</ID><DisplayName>owner-1</DisplayName></Owner>' +
          '<AccessControlList><Grant>public-read</Grant></AccessControlList></AccessControlPolicy>',
      ),
    )

    expect(result.accessControlPolicy).toEqual({
      owner: { id: '1234', displayName: 'owner-1' },
      accessControlList: { grant: 'public-read' },
    })
  })

  it('leaves the nested containers undefined when the body omits them', async () => {
    const command = new GetBucketAcl({ bucket: 'bucket-1' })
    const result = await command.deserialize(output('<AccessControlPolicy></AccessControlPolicy>'))

    expect(result.accessControlPolicy).toEqual({ owner: undefined, accessControlList: undefined })
  })

  it('rejects a body that is not an AccessControlPolicy', async () => {
    const command = new GetBucketAcl({ bucket: 'bucket-1' })
    await expect(command.deserialize(output('<Error><Code>NoSuchBucket</Code></Error>'))).rejects.toThrow(
      'expected element type <AccessControlPolicy> but have <Error>',
    )
  })
})

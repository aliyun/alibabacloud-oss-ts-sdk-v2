import { describe, expect, it } from 'vitest'
import { GetBucketReferer, PutBucketReferer } from '../../../src/api/bucket-referer.js'
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

describe('PutBucketReferer serialize', () => {
  it('builds the configuration body with both lists, the referer sub-resource and the body MD5', async () => {
    const command = new PutBucketReferer({
      bucket: 'bucket-1',
      refererConfiguration: {
        allowEmptyReferer: true,
        allowTruncateQueryString: false,
        refererList: { referers: ['http://a.example', 'http://b.example'] },
        refererBlacklist: { referers: ['http://bad.example'] },
      },
    })
    const serialized = await command.serialize(command.input)

    expect(serialized.opName).toBe('PutBucketReferer')
    expect(serialized.method).toBe('PUT')
    expect(serialized.bucket).toBe('bucket-1')
    expect(serialized.parameters).toEqual({ referer: '' })
    expect(serialized.body).toBe(
      '<?xml version="1.0" encoding="UTF-8"?><RefererConfiguration>' +
        '<AllowEmptyReferer>true</AllowEmptyReferer><AllowTruncateQueryString>false</AllowTruncateQueryString>' +
        '<RefererList><Referer>http://a.example</Referer><Referer>http://b.example</Referer></RefererList>' +
        '<RefererBlacklist><Referer>http://bad.example</Referer></RefererBlacklist></RefererConfiguration>',
    )
    expect(headersOf(serialized)['Content-Type']).toBe('application/xml')
    expect(headersOf(serialized)['Content-MD5']).toBe('r4BNEF259GB2tVVPRdufRg==')
  })

  it('emits a present but empty RefererList as a self-closing element, which clears the whitelist', async () => {
    const command = new PutBucketReferer({ bucket: 'bucket-1', refererConfiguration: { refererList: {} } })
    const serialized = await command.serialize(command.input)
    expect(serialized.body).toBe(
      '<?xml version="1.0" encoding="UTF-8"?><RefererConfiguration><RefererList/></RefererConfiguration>',
    )
  })

  it('sends the empty-body MD5 when no configuration is set', async () => {
    const command = new PutBucketReferer({ bucket: 'bucket-1' })
    const serialized = await command.serialize(command.input)
    expect(serialized.body).toBeUndefined()
    expect(headersOf(serialized)['Content-MD5']).toBe(EMPTY_BODY_MD5)
  })

  it('rejects a missing bucket', () => {
    const command = new PutBucketReferer({ refererConfiguration: {} })
    expect(() => command.serialize(command.input)).toThrow('missing required field, bucket')
  })
})

describe('PutBucketReferer deserialize', () => {
  it('reads the common fields and drains the body', async () => {
    const command = new PutBucketReferer({ bucket: 'bucket-1' })
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

describe('GetBucketReferer serialize', () => {
  it('sends a bodyless referer sub-resource GET with the empty-body MD5', async () => {
    const command = new GetBucketReferer({ bucket: 'bucket-1' })
    const serialized = await command.serialize(command.input)

    expect(serialized.opName).toBe('GetBucketReferer')
    expect(serialized.method).toBe('GET')
    expect(serialized.parameters).toEqual({ referer: '' })
    expect(headersOf(serialized)).toEqual({ 'Content-MD5': EMPTY_BODY_MD5 })
  })
})

describe('GetBucketReferer deserialize', () => {
  it('reads the flags and both Referer lists', async () => {
    const command = new GetBucketReferer({ bucket: 'bucket-1' })
    const result = await command.deserialize(
      output(
        '<RefererConfiguration><AllowEmptyReferer>true</AllowEmptyReferer>' +
          '<AllowTruncateQueryString>false</AllowTruncateQueryString><TruncatePath>true</TruncatePath>' +
          '<RefererList><Referer>http://a.example</Referer><Referer>http://b.example</Referer></RefererList>' +
          '<RefererBlacklist><Referer>http://bad.example</Referer></RefererBlacklist></RefererConfiguration>',
      ),
    )

    expect(result.refererConfiguration).toEqual({
      allowEmptyReferer: true,
      allowTruncateQueryString: false,
      truncatePath: true,
      refererList: { referers: ['http://a.example', 'http://b.example'] },
      refererBlacklist: { referers: ['http://bad.example'] },
    })
  })

  it('leaves the lists undefined when their containers are absent', async () => {
    const command = new GetBucketReferer({ bucket: 'bucket-1' })
    const result = await command.deserialize(
      output('<RefererConfiguration><AllowEmptyReferer>false</AllowEmptyReferer></RefererConfiguration>'),
    )
    expect(result.refererConfiguration).toEqual({
      allowEmptyReferer: false,
      allowTruncateQueryString: undefined,
      truncatePath: undefined,
      refererList: undefined,
      refererBlacklist: undefined,
    })
  })

  it('rejects a body that is not a RefererConfiguration', async () => {
    const command = new GetBucketReferer({ bucket: 'bucket-1' })
    await expect(command.deserialize(output('<Error><Code>AccessDenied</Code></Error>'))).rejects.toThrow(
      'expected element type <RefererConfiguration> but have <Error>',
    )
  })
})

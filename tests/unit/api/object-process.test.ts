import { describe, expect, it } from 'vitest'
import { AsyncProcessObject, ProcessObject } from '../../../src/api/object-process.js'
import type { ResponseBody } from '../../../src/transport/types.js'
import type { OperationInput, OperationOutput } from '../../../src/types.js'
import { textBody } from '../../fixtures/mock-transport.js'
import { headersOf } from '../../fixtures/serialized-headers.js'

const input: OperationInput = { opName: 'Test', method: 'GET' }

function output(headers: Record<string, string>, body?: ResponseBody, statusCode = 200): OperationOutput {
  return { input, status: 'OK', statusCode, headers, body }
}

describe('ProcessObject serialize', () => {
  it('carries the process instruction in the body and the marker in the query', async () => {
    const command = new ProcessObject({
      bucket: 'bucket-1',
      key: 'src.jpg',
      process: 'image/resize,w_100|sys/saveas,o_ZGVzdC5qcGc,b_YnVja2V0LTE',
    })

    const serialized = await command.serialize(command.input)

    expect(serialized.opName).toBe('ProcessObject')
    expect(serialized.method).toBe('POST')
    expect(serialized.bucket).toBe('bucket-1')
    expect(serialized.key).toBe('src.jpg')
    expect(serialized.parameters).toEqual({ 'x-oss-process': '' })
    expect(headersOf(serialized)).toEqual({
      'Content-Type': 'application/xml',
      'Content-MD5': 'VS9MYwXVjzHA7KgWrSNkOA==',
    })
    expect(serialized.body).toBe('x-oss-process=image/resize,w_100|sys/saveas,o_ZGVzdC5qcGc,b_YnVja2V0LTE')
  })

  it('rejects a missing bucket, key, or process by name', () => {
    const noProcess = new ProcessObject({ bucket: 'bucket-1', key: 'k' })
    expect(() => noProcess.serialize(noProcess.input)).toThrow('missing required field, process')

    const noKey = new ProcessObject({ bucket: 'bucket-1', process: 'p' })
    expect(() => noKey.serialize(noKey.input)).toThrow('missing required field, key')
  })
})

describe('ProcessObject deserialize', () => {
  it('hands back the raw JSON body verbatim', async () => {
    const json = '{"bucket":"","fileSize":3267,"object":"dest.jpg","status":"OK"}'
    const command = new ProcessObject({ bucket: 'bucket-1', key: 'k', process: 'p' })
    const result = await command.deserialize(output({ 'x-oss-request-id': 'req-1' }, textBody(json)))

    expect(result.statusCode).toBe(200)
    expect(result.requestId).toBe('req-1')
    expect(result.body).toBe(json)
  })

  it('leaves the body undefined when the response carries none', async () => {
    const command = new ProcessObject({ bucket: 'bucket-1', key: 'k', process: 'p' })
    const result = await command.deserialize(output({}, textBody('')))
    expect(result.body).toBeUndefined()
  })
})

describe('AsyncProcessObject serialize', () => {
  it('carries the async process instruction in the body and its own marker in the query', async () => {
    const command = new AsyncProcessObject({
      bucket: 'bucket-1',
      key: 'src.mp4',
      process: 'video/convert,f_mp4|sys/saveas,o_ZGVzdC5tcDQ,b_YnVja2V0LTE',
    })

    const serialized = await command.serialize(command.input)

    expect(serialized.opName).toBe('AsyncProcessObject')
    expect(serialized.method).toBe('POST')
    expect(serialized.parameters).toEqual({ 'x-oss-async-process': '' })
    expect(headersOf(serialized)).toEqual({
      'Content-Type': 'application/xml',
      'Content-MD5': 'kNt+WN+Q0g7edpqd5Hxrjg==',
    })
    expect(serialized.body).toBe('x-oss-async-process=video/convert,f_mp4|sys/saveas,o_ZGVzdC5tcDQ,b_YnVja2V0LTE')
  })

  it('rejects a missing process by name', () => {
    const command = new AsyncProcessObject({ bucket: 'bucket-1', key: 'k' })
    expect(() => command.serialize(command.input)).toThrow('missing required field, process')
  })
})

describe('AsyncProcessObject deserialize', () => {
  it('hands back the raw JSON body verbatim', async () => {
    const json = '{"EventId":"181-abc","RequestId":"1D99-def","TaskId":"MediaConvert-ghi"}'
    const command = new AsyncProcessObject({ bucket: 'bucket-1', key: 'k', process: 'p' })
    const result = await command.deserialize(output({ 'x-oss-request-id': 'req-2' }, textBody(json)))

    expect(result.statusCode).toBe(200)
    expect(result.requestId).toBe('req-2')
    expect(result.body).toBe(json)
  })
})

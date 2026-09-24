import { describe, expect, it } from 'vitest'
import {
  CanceledError,
  CredentialsError,
  DeserializationError,
  MAX_CAUSE_DEPTH,
  NotSupportedError,
  OperationError,
  OssError,
  ParamInvalidError,
  ParamRequiredError,
  SerializationError,
  ServiceError,
} from '../../../src/error/types.js'

describe('error hierarchy', () => {
  it('gives every class a stable name', () => {
    expect(new OssError('m').name).toBe('OssError')
    expect(new ParamRequiredError('bucket').name).toBe('ParamRequiredError')
    expect(new ParamInvalidError('bucket').name).toBe('ParamInvalidError')
    expect(new SerializationError('m').name).toBe('SerializationError')
    expect(new DeserializationError('m').name).toBe('DeserializationError')
    expect(new CredentialsError('m').name).toBe('CredentialsError')
    expect(new CanceledError().name).toBe('CanceledError')
    expect(new NotSupportedError('file').name).toBe('NotSupportedError')
  })

  it('keeps every subclass one level below OssError', () => {
    expect(new ParamRequiredError('x') instanceof OssError).toBe(true)
    expect(new ServiceError({ statusCode: 404, code: 'NoSuchKey', message: 'm', requestId: 'r', ec: '', headers: {} }) instanceof OssError).toBe(true)
  })

  it('formats required and invalid parameter messages', () => {
    expect(new ParamRequiredError('bucket').message).toBe('missing required field, bucket')
    expect(new ParamInvalidError('bucket').message).toBe('invalid field, bucket')
  })

  it('exposes ServiceError fields used by the retryer and by support tickets', () => {
    const e = new ServiceError({
      statusCode: 403,
      code: 'InvalidAccessKeyId',
      message: 'The OSS Access Key Id you provided does not exist in our records.',
      requestId: '65F3F4A1B2C3D4E5F6A7B8C9',
      ec: '0002-00000902',
      headers: { 'x-oss-request-id': '65F3F4A1B2C3D4E5F6A7B8C9' },
      timestamp: new Date(Date.UTC(2026, 7, 17, 1, 2, 3)),
      requestTarget: 'GET https://b.oss-cn-hangzhou.aliyuncs.com/k',
    })
    expect(e.statusCode).toBe(403)
    expect(e.code).toBe('InvalidAccessKeyId')
    expect(e.requestId).toBe('65F3F4A1B2C3D4E5F6A7B8C9')
    expect(e.ec).toBe('0002-00000902')
    expect(e.message).toContain('Http Status Code: 403')
    expect(e.message).toContain('Error Code: InvalidAccessKeyId')
    expect(e.message).toContain('Request Id: 65F3F4A1B2C3D4E5F6A7B8C9')
    expect(e.message).toContain('EC: 0002-00000902')
  })

  // `message` is the composite, so the server's own words are reachable only through errorMessage.
  it('keeps the server message reachable without parsing the composite apart', () => {
    const e = new ServiceError({
      statusCode: 404,
      code: 'NoSuchKey',
      message: 'The specified key does not exist.',
      requestId: 'r',
      ec: '',
      headers: {},
    })
    expect(e.errorMessage).toBe('The specified key does not exist.')
    expect(e.message).toContain('Message: The specified key does not exist.')
    expect(e.message).not.toBe(e.errorMessage)
  })

  it('wraps an inner error with the operation name', () => {
    const inner = new ParamRequiredError('bucket')
    const wrapped = new OperationError('PutObject', inner)
    expect(wrapped.name).toBe('OperationError')
    expect(wrapped.opName).toBe('PutObject')
    expect(wrapped.cause).toBe(inner)
    expect(wrapped.message).toBe('operation error PutObject: missing required field, bucket')
  })

  describe('OperationError.contains', () => {
    it('finds the direct cause', () => {
      const inner = new ParamRequiredError('bucket')
      expect(new OperationError('PutObject', inner).contains((e) => e instanceof ParamRequiredError)).toBe(inner)
    })

    it('finds an error nested deeper in the cause chain', () => {
      const service = new ServiceError({
        statusCode: 404,
        code: 'NoSuchKey',
        message: 'The specified key does not exist.',
        requestId: 'REQ',
        ec: '0026-00000001',
        headers: {},
      })
      const credentials = new CredentialsError('fetch failed', service)
      expect(new OperationError('GetObject', credentials).contains((e) => e instanceof ServiceError)).toBe(service)
    })

    it('matches a base class, so OssError catches anything from this module', () => {
      const inner = new ParamRequiredError('bucket')
      expect(new OperationError('PutObject', inner).contains((e) => e instanceof OssError)).toBe(inner)
    })

    it('returns undefined when nothing in the chain matches', () => {
      const wrapped = new OperationError('PutObject', new ParamRequiredError('bucket'))
      expect(wrapped.contains((e) => e instanceof ServiceError)).toBeUndefined()
    })

    it('stops at a cause that is not an Error instead of looping', () => {
      const inner = new ParamRequiredError('bucket')
      Object.assign(inner, { cause: 'a string, not an Error' })
      expect(new OperationError('PutObject', inner).contains((e) => e instanceof ServiceError)).toBeUndefined()
    })

    it('does not walk through a non-Error link to reach what is behind it', () => {
      const service = new ServiceError({
        statusCode: 404,
        code: 'NoSuchKey',
        message: 'The specified key does not exist.',
        requestId: 'REQ',
        ec: '0026-00000001',
        headers: {},
      })
      const inner = new ParamRequiredError('bucket')
      Object.assign(inner, { cause: { cause: service } })
      // A matching error behind a non-Error link is what distinguishes stopping from traversing.
      expect(new OperationError('PutObject', inner).contains((e) => e instanceof ServiceError)).toBeUndefined()
    })

    it('terminates on a cyclic chain', () => {
      const inner = new ParamRequiredError('bucket')
      Object.assign(inner, { cause: inner })
      expect(new OperationError('PutObject', inner).contains((e) => e instanceof ServiceError)).toBeUndefined()
    })

    it('gives up past MAX_CAUSE_DEPTH rather than walking a hostile chain', () => {
      const deep = new ServiceError({
        statusCode: 500,
        code: 'InternalError',
        message: 'm',
        requestId: 'R',
        ec: '',
        headers: {},
      })
      let head: Error = deep
      for (let i = 0; i < MAX_CAUSE_DEPTH + 1; i += 1) {
        head = new OssError('link ' + String(i), head)
      }
      expect(new OperationError('PutObject', head).contains((e) => e instanceof ServiceError)).toBeUndefined()
    })
  })
})

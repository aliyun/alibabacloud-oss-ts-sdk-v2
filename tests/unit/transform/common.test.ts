import { describe, expect, it } from 'vitest'
import { ParamInvalidError, ParamRequiredError } from '../../../src/error/types.js'
import type { OperationInput, OperationOutput } from '../../../src/types.js'
import {
  applyUserMetadata,
  requireField,
  resultCommon,
  setBoolean,
  setHeaderBoolean,
  setHeaderNumber,
  setHeaderString,
  setNumber,
  setString,
  toBoolean,
  toDate,
  toNumber,
  userMetadata,
} from '../../../src/transform/common.js'
import { createHeaderFields } from '../../../src/utils/header-fields.js'

const input: OperationInput = { opName: 'Test', method: 'GET' }

function output(headers: Record<string, string>): OperationOutput {
  return { input, status: 'OK', statusCode: 200, headers }
}

describe('resultCommon', () => {
  it('lifts the four common fields and lowercases the header names', () => {
    const result = resultCommon(output({ ETag: '"abc"', 'X-Oss-Request-Id': 'req-1' }))
    expect(result).toEqual({
      status: 'OK',
      statusCode: 200,
      requestId: 'req-1',
      headers: { etag: '"abc"', 'x-oss-request-id': 'req-1' },
    })
  })

  it('leaves requestId empty when the server sent none', () => {
    expect(resultCommon(output({})).requestId).toBe('')
  })
})

describe('userMetadata', () => {
  it('strips the prefix', () => {
    expect(userMetadata({ 'x-oss-meta-author': 'alice', 'x-oss-meta-x': '1', etag: '"a"' })).toEqual({
      author: 'alice',
      x: '1',
    })
  })

  it('returns undefined when there is no user metadata', () => {
    expect(userMetadata({ etag: '"a"' })).toBeUndefined()
  })
})

describe('applyUserMetadata', () => {
  it('adds the prefix', () => {
    const headers = createHeaderFields()
    applyUserMetadata(headers, { author: 'alice' })
    expect(headers.toRecord()).toEqual({ 'x-oss-meta-author': 'alice' })
  })

  it('does nothing for undefined', () => {
    const headers = createHeaderFields()
    applyUserMetadata(headers, undefined)
    expect(headers.toRecord()).toEqual({})
  })

  it('round-trips with userMetadata', () => {
    const headers = createHeaderFields()
    applyUserMetadata(headers, { author: 'alice', 'multi-word': 'v' })
    expect(userMetadata(headers.toRecord())).toEqual({ author: 'alice', 'multi-word': 'v' })
  })

  // The write keeps the caller's case, the read lowercases it, so a mixed-case key does not round-trip.
  it('sends a mixed-case key verbatim and reads it back lowercased', () => {
    const headers = createHeaderFields()
    applyUserMetadata(headers, { Author: 'alice' })
    expect(headers.toRecord()).toEqual({ 'x-oss-meta-Author': 'alice' })
    expect(userMetadata(resultCommon(output(headers.toRecord())).headers)).toEqual({ author: 'alice' })
  })

  // The later write carries its own spelling: the caller's hand-set casing gives way to the lowercase
  // key `applyUserMetadata` writes, so a header the SDK touches last reaches the wire in the SDK's casing.
  it('overwrites a differently-cased key the caller set by hand, taking the later spelling', () => {
    const headers = createHeaderFields({ 'X-Oss-Meta-Author': 'bob' })
    applyUserMetadata(headers, { author: 'alice' })
    expect(headers.toRecord()).toEqual({ 'x-oss-meta-author': 'alice' })
  })
})

describe('toNumber', () => {
  it('parses an integer header', () => {
    expect(toNumber('1024')).toBe(1024)
    expect(toNumber('0')).toBe(0)
    expect(toNumber('-1')).toBe(-1)
  })

  it('returns undefined rather than NaN for junk, empty and missing values', () => {
    expect(toNumber('not a number')).toBeUndefined()
    expect(toNumber('')).toBeUndefined()
    expect(toNumber('   ')).toBeUndefined()
    expect(toNumber(undefined)).toBeUndefined()
  })
})

describe('toDate', () => {
  it('parses an HTTP date', () => {
    expect(toDate('Wed, 28 Dec 2022 10:27:41 GMT')?.toISOString()).toBe('2022-12-28T10:27:41.000Z')
  })

  it('returns undefined for a missing or unparsable value', () => {
    expect(toDate(undefined)).toBeUndefined()
    expect(toDate('yesterday')).toBeUndefined()
  })
})

describe('toBoolean', () => {
  it('accepts either case of true', () => {
    expect(toBoolean('true')).toBe(true)
    expect(toBoolean('True')).toBe(true)
  })

  it('treats anything else as false and a missing value as undefined', () => {
    expect(toBoolean('false')).toBe(false)
    expect(toBoolean('1')).toBe(false)
    expect(toBoolean(undefined)).toBeUndefined()
  })
})

describe('requireField', () => {
  it('returns the value when it is present', () => {
    expect(requireField('bucket-1', 'bucket')).toBe('bucket-1')
    expect(requireField(0, 'contentLength')).toBe(0)
  })

  it('throws ParamRequiredError naming the field', () => {
    expect(() => requireField(undefined, 'bucket')).toThrow(ParamRequiredError)
    expect(() => requireField(undefined, 'bucket')).toThrow('missing required field, bucket')
  })
})

describe('header and query setters', () => {
  it('write each type under the given wire name', () => {
    const target: Record<string, string> = {}
    setString(target, 'Content-Type', 'text/plain')
    setNumber(target, 'Content-Length', 11)
    setBoolean(target, 'x-oss-forbid-overwrite', true)
    expect(target).toEqual({
      'Content-Type': 'text/plain',
      'Content-Length': '11',
      'x-oss-forbid-overwrite': 'true',
    })
  })

  it('skip undefined, so an unset field puts nothing on the wire', () => {
    const target: Record<string, string> = {}
    setString(target, 'Content-Type', undefined)
    setNumber(target, 'Content-Length', undefined)
    setBoolean(target, 'x-oss-forbid-overwrite', undefined)
    expect(target).toEqual({})
  })

  it('write false and 0, which are values rather than absences', () => {
    const target: Record<string, string> = {}
    setNumber(target, 'Content-Length', 0)
    setBoolean(target, 'x-oss-forbid-overwrite', false)
    expect(target).toEqual({ 'Content-Length': '0', 'x-oss-forbid-overwrite': 'false' })
  })

  it('keep an empty string, which OSS accepts as a real value', () => {
    const target: Record<string, string> = {}
    setString(target, 'Content-Disposition', '')
    expect(target).toEqual({ 'Content-Disposition': '' })
  })

  it('reject a non-finite number rather than sending "NaN"', () => {
    const target: Record<string, string> = {}
    expect(() => setNumber(target, 'Content-Length', Number.NaN)).toThrow(ParamInvalidError)
    expect(() => setNumber(target, 'Content-Length', Number.POSITIVE_INFINITY)).toThrow(ParamInvalidError)
    expect(target).toEqual({})
  })
})

describe('header setters', () => {
  it('write each type under the given wire name', () => {
    const headers = createHeaderFields()
    setHeaderString(headers, 'Content-Type', 'text/plain')
    setHeaderNumber(headers, 'Content-Length', 11)
    setHeaderBoolean(headers, 'x-oss-forbid-overwrite', true)
    expect(headers.toRecord()).toEqual({
      'Content-Type': 'text/plain',
      'Content-Length': '11',
      'x-oss-forbid-overwrite': 'true',
    })
  })

  it('skip undefined, so an unset field puts nothing on the wire', () => {
    const headers = createHeaderFields()
    setHeaderString(headers, 'Content-Type', undefined)
    setHeaderNumber(headers, 'Content-Length', undefined)
    setHeaderBoolean(headers, 'x-oss-forbid-overwrite', undefined)
    expect(headers.toRecord()).toEqual({})
  })

  it('write false and 0, which are values rather than absences', () => {
    const headers = createHeaderFields()
    setHeaderNumber(headers, 'Content-Length', 0)
    setHeaderBoolean(headers, 'x-oss-forbid-overwrite', false)
    expect(headers.toRecord()).toEqual({ 'Content-Length': '0', 'x-oss-forbid-overwrite': 'false' })
  })

  it('overwrite a differently-cased name without adding a second field, taking the setter spelling', () => {
    const headers = createHeaderFields({
      'content-type': 'application/json',
      'CONTENT-LENGTH': '99',
      'X-Oss-Forbid-Overwrite': 'false',
    })
    setHeaderString(headers, 'Content-Type', 'text/plain')
    setHeaderNumber(headers, 'Content-Length', 11)
    setHeaderBoolean(headers, 'x-oss-forbid-overwrite', true)
    expect(headers.toRecord()).toEqual({
      'Content-Type': 'text/plain',
      'Content-Length': '11',
      'x-oss-forbid-overwrite': 'true',
    })
  })

  it('reject a non-finite number rather than sending "NaN"', () => {
    const headers = createHeaderFields()
    expect(() => setHeaderNumber(headers, 'Content-Length', Number.NaN)).toThrow(ParamInvalidError)
    expect(headers.toRecord()).toEqual({})
  })
})

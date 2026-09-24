import { describe, expect, it } from 'vitest'
import { ParamInvalidError } from '../../../src/error/types.js'
import { SignerV1 } from '../../../src/signer/v1.js'
import type { SigningContext } from '../../../src/signer/types.js'
import type { RequestMessage } from '../../../src/transport/types.js'
import { createHeaderFields } from '../../../src/utils/header-fields.js'

type SigningInput = Omit<SigningContext, 'stringToSign' | 'dateToSign' | 'scopeToSign' | 'additionalHeadersToSign'>

function context(input: SigningInput): SigningContext {
  return { ...input, stringToSign: '', dateToSign: '', scopeToSign: '', additionalHeadersToSign: '' }
}

describe('SignerV1', () => {
  it('signs a PUT with Content-MD5, Content-Type and x-oss-meta headers', async () => {
    const request: RequestMessage = {
      method: 'PUT',
      url: 'http://examplebucket.oss-cn-hangzhou.aliyuncs.com',
      headers: createHeaderFields({
        'Content-MD5': 'eB5eJF1ptWaXm4bijSPyxw==',
        'Content-Type': 'text/html',
        'x-oss-meta-author': 'alice',
        'x-oss-meta-magic': 'abracadabra',
        'x-oss-date': 'Wed, 28 Dec 2022 10:27:41 GMT',
      }),
    }
    const ctx = context({
      authHeader: true,
      credentials: { accessKeyId: 'ak', accessKeySecret: 'sk' },
      bucket: 'examplebucket',
      key: 'nelson',
      signTime: new Date(Date.UTC(2022, 11, 28, 10, 27, 41)),
    })
    await new SignerV1().sign(request, ctx)

    expect(ctx.stringToSign).toBe(
      'PUT\neB5eJF1ptWaXm4bijSPyxw==\ntext/html\nWed, 28 Dec 2022 10:27:41 GMT\n' +
        'x-oss-date:Wed, 28 Dec 2022 10:27:41 GMT\nx-oss-meta-author:alice\nx-oss-meta-magic:abracadabra\n' +
        '/examplebucket/nelson',
    )
    expect(request.headers.get('Authorization')).toBe('OSS ak:kSHKmLxlyEAKtZPkJhG9bZb5k7M=')
  })

  it('signs a required parameter that arrived on the URL as part of the resource', async () => {
    const request: RequestMessage = {
      method: 'PUT',
      url: 'http://examplebucket.oss-cn-hangzhou.aliyuncs.com/?acl',
      headers: createHeaderFields({
        'Content-MD5': 'eB5eJF1ptWaXm4bijSPyxw==',
        'Content-Type': 'text/html',
        'x-oss-meta-author': 'alice',
        'x-oss-meta-magic': 'abracadabra',
        'x-oss-date': 'Wed, 28 Dec 2022 10:27:41 GMT',
      }),
    }
    const ctx = context({
      authHeader: true,
      credentials: { accessKeyId: 'ak', accessKeySecret: 'sk' },
      bucket: 'examplebucket',
      key: 'nelson',
      signTime: new Date(Date.UTC(2022, 11, 28, 10, 27, 41)),
    })
    await new SignerV1().sign(request, ctx)

    expect(ctx.stringToSign).toBe(
      'PUT\neB5eJF1ptWaXm4bijSPyxw==\ntext/html\nWed, 28 Dec 2022 10:27:41 GMT\n' +
        'x-oss-date:Wed, 28 Dec 2022 10:27:41 GMT\nx-oss-meta-author:alice\nx-oss-meta-magic:abracadabra\n' +
        '/examplebucket/nelson?acl',
    )
    expect(request.headers.get('Authorization')).toBe('OSS ak:/afkugFbmWDQ967j1vr6zygBLQk=')
  })

  it('signs a context-supplied sub-resource and drops unlisted parameters', async () => {
    const request: RequestMessage = {
      method: 'GET',
      url: 'http://examplebucket.oss-cn-hangzhou.aliyuncs.com/?comp=list&non-resousce=null',
      headers: createHeaderFields({ 'x-oss-date': 'Wed, 28 Dec 2022 10:27:41 GMT' }),
    }
    const ctx = context({
      authHeader: true,
      credentials: { accessKeyId: 'ak', accessKeySecret: 'sk' },
      bucket: 'examplebucket',
      subResource: ['comp'],
      signTime: new Date(Date.UTC(2022, 11, 28, 10, 27, 41)),
    })
    await new SignerV1().sign(request, ctx)

    expect(ctx.stringToSign).toContain('/examplebucket/?comp=list')
    expect(ctx.stringToSign).not.toContain('non-resousce')
  })

  it('sorts sub-resources and always signs a required parameter such as acl', async () => {
    const request: RequestMessage = {
      method: 'GET',
      url: 'http://examplebucket.oss-cn-hangzhou.aliyuncs.com/?resourceGroup&acl',
      headers: createHeaderFields({ 'x-oss-date': 'Wed, 28 Dec 2022 10:27:41 GMT' }),
    }
    const ctx = context({
      authHeader: true,
      credentials: { accessKeyId: 'ak', accessKeySecret: 'sk' },
      bucket: 'examplebucket',
      signTime: new Date(Date.UTC(2022, 11, 28, 10, 27, 41)),
    })
    await new SignerV1().sign(request, ctx)

    expect(ctx.stringToSign).toBe(
      'GET\n\n\nWed, 28 Dec 2022 10:27:41 GMT\nx-oss-date:Wed, 28 Dec 2022 10:27:41 GMT\n/examplebucket/?acl&resourceGroup',
    )
    expect(request.headers.get('Authorization')).toBe('OSS ak:x3E5TgOvl/i7PN618s5mEvpJDYk=')
  })

  it('sets the Date header from signTime when the caller supplied none', async () => {
    const request: RequestMessage = { method: 'GET', url: 'http://b.oss-cn-hangzhou.aliyuncs.com/k', headers: createHeaderFields({}) }
    await new SignerV1().sign(
      request,
      context({
        authHeader: true,
        credentials: { accessKeyId: 'ak', accessKeySecret: 'sk' },
        bucket: 'b',
        key: 'k',
        signTime: new Date(Date.UTC(2022, 11, 28, 10, 27, 41)),
      }),
    )

    expect(request.headers.get('Date')).toBe('Wed, 28 Dec 2022 10:27:41 GMT')
  })

  it('overwrites a caller-supplied Date so the date sent is the date signed', async () => {
    const request: RequestMessage = {
      method: 'GET',
      url: 'http://b.x/k',
      headers: createHeaderFields({ Date: 'Mon, 01 Jan 2001 00:00:00 GMT' }),
    }
    const ctx = context({
      authHeader: true,
      credentials: { accessKeyId: 'ak', accessKeySecret: 'sk' },
      bucket: 'b',
      key: 'k',
      signTime: new Date(Date.UTC(2022, 11, 28, 10, 27, 41)),
    })
    await new SignerV1().sign(request, ctx)

    expect(request.headers.get('Date')).toBe('Wed, 28 Dec 2022 10:27:41 GMT')
    expect(ctx.stringToSign).toBe('GET\n\n\nWed, 28 Dec 2022 10:27:41 GMT\n/b/k')
  })

  it('replaces a caller-supplied Date whatever its case, so only one is sent', async () => {
    const request: RequestMessage = {
      method: 'GET',
      url: 'http://b.x/k',
      headers: createHeaderFields({ date: 'Mon, 01 Jan 2001 00:00:00 GMT' }),
    }
    await new SignerV1().sign(
      request,
      context({
        authHeader: true,
        credentials: { accessKeyId: 'ak', accessKeySecret: 'sk' },
        bucket: 'b',
        key: 'k',
        signTime: new Date(Date.UTC(2022, 11, 28, 10, 27, 41)),
      }),
    )

    expect(Object.keys(request.headers.toRecord()).filter((k) => k.toLowerCase() === 'date')).toEqual(['Date'])
    expect(request.headers.get('date')).toBe('Wed, 28 Dec 2022 10:27:41 GMT')
  })

  it('signs the security token, and does so before building the string-to-sign', async () => {
    const request: RequestMessage = { method: 'GET', url: 'http://b.x/k', headers: createHeaderFields({}) }
    const ctx = context({
      authHeader: true,
      credentials: { accessKeyId: 'ak', accessKeySecret: 'sk', securityToken: 'tok' },
      bucket: 'b',
      key: 'k',
      signTime: new Date(Date.UTC(2022, 11, 28, 10, 27, 41)),
    })
    await new SignerV1().sign(request, ctx)

    expect(request.headers.get('x-oss-security-token')).toBe('tok')
    expect(ctx.stringToSign).toContain('x-oss-security-token:tok\n')
  })

  it('signs the fresh security token when the caller left a differently-cased one', async () => {
    const request: RequestMessage = { method: 'GET', url: 'http://b.x/k', headers: createHeaderFields({ 'X-Oss-Security-Token': 'STALE' }) }
    const ctx = context({
      authHeader: true,
      credentials: { accessKeyId: 'ak', accessKeySecret: 'sk', securityToken: 'FRESH' },
      bucket: 'b',
      key: 'k',
      signTime: new Date(Date.UTC(2022, 11, 28, 10, 27, 41)),
    })
    await new SignerV1().sign(request, ctx)

    expect(Object.keys(request.headers.toRecord()).filter((k) => k.toLowerCase() === 'x-oss-security-token')).toEqual([
      'x-oss-security-token',
    ])
    expect(ctx.stringToSign).toContain('x-oss-security-token:FRESH\n')
  })

  it('sorts canonicalized headers by name, not by the assembled line', async () => {
    const ctx = context({
      authHeader: true,
      credentials: { accessKeyId: 'ak', accessKeySecret: 'sk' },
      bucket: 'b',
      key: 'k',
      signTime: new Date(Date.UTC(2022, 11, 28, 10, 27, 41)),
    })
    await new SignerV1().sign(
      {
        method: 'PUT',
        url: 'http://b.x/k',
        headers: createHeaderFields({ 'x-oss-copy-source-range': 'bytes=0-9', 'x-oss-copy-source': '/src/obj' }),
      },
      ctx,
    )

    expect(ctx.stringToSign).toContain('x-oss-copy-source:/src/obj\nx-oss-copy-source-range:bytes=0-9\n')
  })

  // Two spellings of one name can no longer coexist: `HeaderFields` keys by lowercase, so the second
  // set overwrites the first and only the surviving value is signed.
  it('signs the surviving value when the caller sent two spellings of one x-oss- header', async () => {
    const ctx = context({
      authHeader: true,
      credentials: { accessKeyId: 'ak', accessKeySecret: 'sk' },
      bucket: 'b',
      key: 'k',
      signTime: new Date(Date.UTC(2022, 11, 28, 10, 27, 41)),
    })
    await new SignerV1().sign(
      {
        method: 'PUT',
        url: 'http://b.x/k',
        headers: createHeaderFields({ 'x-oss-meta-author': ' alice ', 'X-Oss-Meta-Author': ' bob ' }),
      },
      ctx,
    )

    expect(ctx.stringToSign).toBe('PUT\n\n\nWed, 28 Dec 2022 10:27:41 GMT\nx-oss-meta-author:bob\n/b/k')
  })

  it('omits the canonicalized header block entirely when no x-oss- header exists', async () => {
    const ctx = context({
      authHeader: true,
      credentials: { accessKeyId: 'ak', accessKeySecret: 'sk' },
      bucket: 'b',
      key: 'k',
      signTime: new Date(Date.UTC(2022, 11, 28, 10, 27, 41)),
    })
    await new SignerV1().sign(
      { method: 'GET', url: 'http://b.x/k', headers: createHeaderFields({ Date: 'Wed, 28 Dec 2022 10:27:41 GMT' }) },
      ctx,
    )

    expect(ctx.stringToSign).toBe('GET\n\n\nWed, 28 Dec 2022 10:27:41 GMT\n/b/k')
  })

  it('trims header values before signing', async () => {
    const ctx = context({
      authHeader: true,
      credentials: { accessKeyId: 'ak', accessKeySecret: 'sk' },
      bucket: 'b',
      key: 'k',
      signTime: new Date(Date.UTC(2022, 11, 28, 10, 27, 41)),
    })
    await new SignerV1().sign(
      { method: 'PUT', url: 'http://b.x/k', headers: createHeaderFields({ 'x-oss-meta-author': '  alice  ' }) },
      ctx,
    )

    expect(ctx.stringToSign).toContain('x-oss-meta-author:alice\n')
  })

  it('signs an x-oss- query parameter even though it is not in the required list', async () => {
    const ctx = context({
      authHeader: true,
      credentials: { accessKeyId: 'ak', accessKeySecret: 'sk' },
      bucket: 'b',
      key: 'k',
      signTime: new Date(Date.UTC(2022, 11, 28, 10, 27, 41)),
    })
    await new SignerV1().sign({ method: 'GET', url: 'http://b.x/k?x-oss-process=abc', headers: createHeaderFields({}) }, ctx)

    expect(ctx.stringToSign).toContain('/b/k?x-oss-process=abc')
  })

  it('signs the decoded value of a percent-encoded parameter', async () => {
    const ctx = context({
      authHeader: true,
      credentials: { accessKeyId: 'ak', accessKeySecret: 'sk' },
      bucket: 'b',
      key: 'k',
      signTime: new Date(Date.UTC(2022, 11, 28, 10, 27, 41)),
    })
    await new SignerV1().sign(
      {
        method: 'GET',
        url: 'http://b.x/k?response-content-disposition=attachment%3B%20filename%3D%22a%2Bb.txt%22',
        headers: createHeaderFields({}),
      },
      ctx,
    )

    expect(ctx.stringToSign).toContain('/b/k?response-content-disposition=attachment; filename="a+b.txt"')
  })

  it('signs the multipart and versioning parameters from the required list', async () => {
    const ctx = context({
      authHeader: true,
      credentials: { accessKeyId: 'ak', accessKeySecret: 'sk' },
      bucket: 'b',
      key: 'k',
      signTime: new Date(Date.UTC(2022, 11, 28, 10, 27, 41)),
    })
    await new SignerV1().sign(
      { method: 'PUT', url: 'http://b.x/k?partNumber=1&uploadId=UP1&versionId=V1', headers: createHeaderFields({}) },
      ctx,
    )

    expect(ctx.stringToSign).toContain('/b/k?partNumber=1&uploadId=UP1&versionId=V1')
  })

  it('signs resourceGroup and cleanRestoredObject from the required list', async () => {
    const ctx = context({
      authHeader: true,
      credentials: { accessKeyId: 'ak', accessKeySecret: 'sk' },
      bucket: 'b',
      key: 'k',
      signTime: new Date(Date.UTC(2022, 11, 28, 10, 27, 41)),
    })
    await new SignerV1().sign(
      { method: 'GET', url: 'http://b.x/k?cleanRestoredObject&resourceGroup', headers: createHeaderFields({}) },
      ctx,
    )

    expect(ctx.stringToSign).toContain('/b/k?cleanRestoredObject&resourceGroup')
  })

  it('re-signs an already-signed request into what a fresh one would carry', async () => {
    const request: RequestMessage = {
      method: 'PUT',
      url: 'http://examplebucket.oss-cn-hangzhou.aliyuncs.com/nelson',
      headers: createHeaderFields({ 'Content-Type': 'text/html', 'x-oss-meta-author': 'alice' }),
    }
    const first = context({
      authHeader: true,
      credentials: { accessKeyId: 'ak', accessKeySecret: 'sk' },
      bucket: 'examplebucket',
      key: 'nelson',
      signTime: new Date(1702743657 * 1000),
    })
    await new SignerV1().sign(request, first)
    expect(request.headers.get('Date')).toBe('Sat, 16 Dec 2023 16:20:57 GMT')
    const firstAuthorization = request.headers.get('Authorization')

    // 100 seconds later, so only the instant moves.
    const second = context({
      authHeader: true,
      credentials: { accessKeyId: 'ak', accessKeySecret: 'sk' },
      bucket: 'examplebucket',
      key: 'nelson',
      signTime: new Date(1702743757 * 1000),
    })
    await new SignerV1().sign(request, second)
    expect(request.headers.get('Date')).toBe('Sat, 16 Dec 2023 16:22:37 GMT')
    expect(request.headers.get('Authorization')).not.toBe(firstAuthorization)

    const fresh: RequestMessage = {
      method: 'PUT',
      url: 'http://examplebucket.oss-cn-hangzhou.aliyuncs.com/nelson',
      headers: createHeaderFields({ 'Content-Type': 'text/html', 'x-oss-meta-author': 'alice' }),
    }
    const freshCtx = context({
      authHeader: true,
      credentials: { accessKeyId: 'ak', accessKeySecret: 'sk' },
      bucket: 'examplebucket',
      key: 'nelson',
      signTime: new Date(1702743757 * 1000),
    })
    await new SignerV1().sign(fresh, freshCtx)

    expect(second.stringToSign).toBe(freshCtx.stringToSign)
    expect(request.headers.get('Authorization')).toBe(fresh.headers.get('Authorization'))
  })

  it('signs the refreshed token when re-signing with new credentials', async () => {
    const request: RequestMessage = {
      method: 'PUT',
      url: 'http://examplebucket.oss-cn-hangzhou.aliyuncs.com/nelson',
      headers: createHeaderFields({ 'Content-Type': 'text/html' }),
    }
    await new SignerV1().sign(
      request,
      context({
        authHeader: true,
        credentials: { accessKeyId: 'ak', accessKeySecret: 'sk', securityToken: 'token1' },
        bucket: 'examplebucket',
        key: 'nelson',
        signTime: new Date(1702743657 * 1000),
      }),
    )
    expect(request.headers.get('x-oss-security-token')).toBe('token1')

    const ctx = context({
      authHeader: true,
      credentials: { accessKeyId: 'ak', accessKeySecret: 'sk', securityToken: 'token2' },
      bucket: 'examplebucket',
      key: 'nelson',
      signTime: new Date(1702743757 * 1000),
    })
    await new SignerV1().sign(request, ctx)

    expect(request.headers.get('x-oss-security-token')).toBe('token2')
    expect(ctx.stringToSign).toContain('x-oss-security-token:token2\n')
  })

  it('derives signTime from the system clock plus clockOffset', async () => {
    const ctx = context({
      authHeader: true,
      credentials: { accessKeyId: 'ak', accessKeySecret: 'sk' },
      bucket: 'b',
      key: 'k',
      clockOffset: 1661000,
    })

    const before = Date.now()
    await new SignerV1().sign({ method: 'GET', url: 'http://b.x/k', headers: createHeaderFields({}) }, ctx)
    const signed = ctx.signTime?.getTime() ?? 0
    expect(signed).toBeGreaterThanOrEqual(before + 1661000)
    expect(signed).toBeLessThanOrEqual(Date.now() + 1661000)
  })

  it('rejects credentials with an empty key rather than leaving the request unsigned', async () => {
    const request: RequestMessage = { method: 'GET', url: 'http://b.x/k', headers: createHeaderFields({}) }
    await expect(
      new SignerV1().sign(
        request,
        context({
          authHeader: true,
          credentials: { accessKeyId: '', accessKeySecret: '' },
          bucket: 'b',
          key: 'k',
          signTime: new Date(Date.UTC(2022, 11, 28, 10, 27, 41)),
        }),
      ),
    ).rejects.toThrow(ParamInvalidError)

    expect(request.headers.get('Authorization')).toBeUndefined()
  })

  it('rejects an absent credentials field', async () => {
    const request: RequestMessage = { method: 'GET', url: 'http://b.x/k', headers: createHeaderFields({}) }
    await expect(
      new SignerV1().sign(
        request,
        context({
          authHeader: true,
          bucket: 'b',
          key: 'k',
          signTime: new Date(Date.UTC(2022, 11, 28, 10, 27, 41)),
        }),
      ),
    ).rejects.toThrow('invalid field, SigningContext.credentials')
  })
})

describe('SignerV1 in query mode', () => {
  it('reproduces the published presign vector', async () => {
    const request: RequestMessage = {
      method: 'GET',
      url: 'http://bucket.oss-cn-hangzhou.aliyuncs.com/key?versionId=versionId',
      headers: createHeaderFields({}),
    }
    const ctx = context({
      authHeader: false,
      credentials: { accessKeyId: 'ak', accessKeySecret: 'sk' },
      bucket: 'bucket',
      key: 'key',
      expirationTime: new Date(1699807420 * 1000),
    })
    await new SignerV1().sign(request, ctx)

    // `Expires` is the fourth line, in place of the `Date` header the header mode signs.
    expect(ctx.stringToSign).toBe('GET\n\n\n1699807420\n/bucket/key?versionId=versionId')
    expect(request.url).toBe(
      'http://bucket.oss-cn-hangzhou.aliyuncs.com/key' +
        '?Expires=1699807420&OSSAccessKeyId=ak&Signature=dcLTea%2BYh9ApirQ8o8dOPqtvJXQ%3D&versionId=versionId',
    )
    expect(request.headers.get('Date')).toBeUndefined()
  })

  it('signs the security token as the sub-resource it is', async () => {
    const request: RequestMessage = {
      method: 'GET',
      url: 'http://bucket.oss-cn-hangzhou.aliyuncs.com/key%2B123?versionId=versionId',
      headers: createHeaderFields({}),
    }
    const ctx = context({
      authHeader: false,
      credentials: { accessKeyId: 'ak', accessKeySecret: 'sk', securityToken: 'token' },
      bucket: 'bucket',
      key: 'key+123',
      expirationTime: new Date(1699808204 * 1000),
    })
    await new SignerV1().sign(request, ctx)

    expect(ctx.stringToSign).toContain('security-token=token&versionId=versionId')
    expect(request.url).toBe(
      'http://bucket.oss-cn-hangzhou.aliyuncs.com/key%2B123' +
        '?Expires=1699808204&OSSAccessKeyId=ak&Signature=jzKYRrM5y6Br0dRFPaTGOsbrDhY%3D' +
        '&security-token=token&versionId=versionId',
    )
    expect(request.headers.get('x-oss-security-token')).toBeUndefined()
  })

  it('signs the decoded token and puts the encoded one on the URL', async () => {
    const request: RequestMessage = {
      method: 'GET',
      url: 'http://bucket.oss-cn-hangzhou.aliyuncs.com/key+123?versionId=versionId',
      headers: createHeaderFields({}),
    }
    const ctx = context({
      authHeader: false,
      credentials: {
        accessKeyId: 'ak',
        accessKeySecret: 'sk',
        securityToken: 'attachment; /file/name==example.txt++',
      },
      bucket: 'bucket',
      key: 'key+123',
      expirationTime: new Date(1699808204 * 1000),
    })
    await new SignerV1().sign(request, ctx)

    expect(ctx.stringToSign).toContain('security-token=attachment; /file/name==example.txt++&versionId=versionId')
    expect(request.url).toBe(
      'http://bucket.oss-cn-hangzhou.aliyuncs.com/key+123' +
        '?Expires=1699808204&OSSAccessKeyId=ak&Signature=su58IVk06Q73DHwcMsXft%2FRTZ98%3D' +
        '&security-token=attachment%3B%20%2Ffile%2Fname%3D%3Dexample.txt%2B%2B&versionId=versionId',
    )
  })

  it('signs only the sub-resources among many parameters, and keeps the rest on the URL', async () => {
    const request: RequestMessage = {
      method: 'GET',
      url:
        'http://bucket.oss-cn-hangzhou.aliyuncs.com/key?versionId=versionId&param1=value1&%2Bparam1=value3' +
        '&%7Cparam1=value4&%2Bparam2=&%7Cparam2=&param2=&response-content-disposition=attachment%3B%20filename%3Dexample.txt',
      headers: createHeaderFields({
        'x-oss-head1': 'value',
        'abc': 'value',
        'ZAbc': 'value',
        'XYZ': 'value',
        'content-type': 'application/octet-stream',
      }),
    }
    const ctx = context({
      authHeader: false,
      credentials: { accessKeyId: 'ak', accessKeySecret: 'sk', securityToken: 'token' },
      bucket: 'bucket',
      key: 'key',
      expirationTime: new Date(1699808204 * 1000),
    })
    await new SignerV1().sign(request, ctx)

    expect(ctx.stringToSign).toBe(
      'GET\n\napplication/octet-stream\n1699808204\nx-oss-head1:value\n' +
        '/bucket/key?response-content-disposition=attachment; filename=example.txt&security-token=token&versionId=versionId',
    )
    const query = request.url.substring(request.url.indexOf('?') + 1).split('&')
    expect(query).toContain('Signature=VmWfLWfxbR3MSFvUx5%2BnyQhCa3g%3D')
    expect(query).toContain('response-content-disposition=attachment%3B%20filename%3Dexample.txt')
    expect(query).toContain('security-token=token')
    expect(query).toContain('%2Bparam1=value3')
  })

  it('defaults the expiry to fifteen minutes past the signing instant and reports it', async () => {
    const signTime = new Date(Date.UTC(2022, 11, 28, 10, 27, 41))
    const request: RequestMessage = { method: 'GET', url: 'http://b.x/k', headers: createHeaderFields({}) }
    const ctx = context({
      authHeader: false,
      credentials: { accessKeyId: 'ak', accessKeySecret: 'sk' },
      bucket: 'b',
      key: 'k',
      signTime,
    })
    await new SignerV1().sign(request, ctx)

    expect(ctx.dateToSign).toBe(String(Math.floor((signTime.getTime() + 900_000) / 1000)))
    expect(ctx.expirationTime?.getTime()).toBe(signTime.getTime() + 900_000)
  })
})

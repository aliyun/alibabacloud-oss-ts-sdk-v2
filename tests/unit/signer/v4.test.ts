import { describe, expect, it } from 'vitest'
import { ParamInvalidError } from '../../../src/error/types.js'
import { SignerV4 } from '../../../src/signer/v4.js'
import type { SigningContext } from '../../../src/signer/types.js'
import type { RequestMessage } from '../../../src/transport/types.js'
import { createHeaderFields } from '../../../src/utils/header-fields.js'

type SigningInput = Omit<SigningContext, 'stringToSign' | 'dateToSign' | 'scopeToSign' | 'additionalHeadersToSign'>

function context(input: SigningInput): SigningContext {
  return { ...input, stringToSign: '', dateToSign: '', scopeToSign: '', additionalHeadersToSign: '' }
}

function queryOf(url: string): Record<string, string> {
  const out: Record<string, string> = {}
  for (const segment of url.substring(url.indexOf('?') + 1).split('&')) {
    const eq = segment.indexOf('=')
    if (eq < 0) out[decodeURIComponent(segment)] = ''
    else out[decodeURIComponent(segment.substring(0, eq))] = decodeURIComponent(segment.substring(eq + 1))
  }
  return out
}

describe('SignerV4', () => {
  it('reproduces the published signature vector with no additional headers', async () => {
    const req: RequestMessage = {
      method: 'PUT',
      url: 'http://bucket.oss-cn-hangzhou.aliyuncs.com?%2Bparam1=value3&%2Bparam2=&param1=value1&param2=&%7Cparam1=value4&%7Cparam2=',
      headers: createHeaderFields({
        'x-oss-head1': 'value',
        'abc': 'value',
        'ZAbc': 'value',
        'XYZ': 'value',
        'content-type': 'text/plain',
      }),
    }
    const ctx = context({
      authHeader: true,
      credentials: { accessKeyId: 'ak', accessKeySecret: 'sk' },
      bucket: 'bucket',
      key: '1234+-/123/1.txt',
      region: 'cn-hangzhou',
      product: 'oss',
      signTime: new Date(1702743657 * 1000),
    })
    await new SignerV4().sign(req, ctx)

    expect(ctx.stringToSign).toBe(
      'OSS4-HMAC-SHA256\n20231216T162057Z\n20231216/cn-hangzhou/oss/aliyun_v4_request\n' +
        'f4613657f1b108998e8dbd10a1aa5da621dc2c6e02c9ddec0f163664848704c4',
    )
    expect(ctx.scopeToSign).toBe('20231216/cn-hangzhou/oss/aliyun_v4_request')
    expect(ctx.dateToSign).toBe('20231216')
    expect(req.headers.get('Authorization')).toBe(
      'OSS4-HMAC-SHA256 Credential=ak/20231216/cn-hangzhou/oss/aliyun_v4_request,' +
        'Signature=e21d18daa82167720f9b1047ae7e7f1ce7cb77a31e8203a7d5f4624fa0284afe',
    )
  })

  it('builds the exact canonical request', async () => {
    const req: RequestMessage = {
      method: 'PUT',
      url: 'http://bucket.oss-cn-hangzhou.aliyuncs.com?%2Bparam1=value3&%2Bparam2=&param1=value1&param2=&%7Cparam1=value4&%7Cparam2=',
      headers: createHeaderFields({
        'x-oss-head1': 'value',
        'abc': 'value',
        'ZAbc': 'value',
        'XYZ': 'value',
        'content-type': 'text/plain',
      }),
    }
    const ctx = context({
      authHeader: true,
      credentials: { accessKeyId: 'ak', accessKeySecret: 'sk' },
      bucket: 'bucket',
      key: '1234+-/123/1.txt',
      region: 'cn-hangzhou',
      product: 'oss',
      signTime: new Date(1702743657 * 1000),
    })
    await new SignerV4().sign(req, ctx)

    expect(ctx.canonicalRequest).toBe(
      'PUT\n/bucket/1234%2B-/123/1.txt\n' +
        '%2Bparam1=value3&%2Bparam2&%7Cparam1=value4&%7Cparam2&param1=value1&param2\n' +
        'content-type:text/plain\nx-oss-content-sha256:UNSIGNED-PAYLOAD\nx-oss-date:20231216T162057Z\nx-oss-head1:value\n' +
        '\n\nUNSIGNED-PAYLOAD',
    )
  })

  it('defaults the product to oss, reproducing the base vector exactly', async () => {
    const req: RequestMessage = {
      method: 'PUT',
      url: 'http://bucket.oss-cn-hangzhou.aliyuncs.com?%2Bparam1=value3&%2Bparam2=&param1=value1&param2=&%7Cparam1=value4&%7Cparam2=',
      headers: createHeaderFields({
        'x-oss-head1': 'value',
        'abc': 'value',
        'ZAbc': 'value',
        'XYZ': 'value',
        'content-type': 'text/plain',
      }),
    }
    const ctx = context({
      authHeader: true,
      credentials: { accessKeyId: 'ak', accessKeySecret: 'sk' },
      bucket: 'bucket',
      key: '1234+-/123/1.txt',
      region: 'cn-hangzhou',
      signTime: new Date(1702743657 * 1000),
    })
    await new SignerV4().sign(req, ctx)

    expect(ctx.scopeToSign).toBe('20231216/cn-hangzhou/oss/aliyun_v4_request')
    expect(req.headers.get('Authorization')).toBe(
      'OSS4-HMAC-SHA256 Credential=ak/20231216/cn-hangzhou/oss/aliyun_v4_request,' +
        'Signature=e21d18daa82167720f9b1047ae7e7f1ce7cb77a31e8203a7d5f4624fa0284afe',
    )
  })

  it('signs content-md5, which is a default-signed header alongside content-type', async () => {
    const req: RequestMessage = {
      method: 'PUT',
      url: 'http://bucket.oss-cn-hangzhou.aliyuncs.com?%2Bparam1=value3&%2Bparam2=&param1=value1&param2=&%7Cparam1=value4&%7Cparam2=',
      headers: createHeaderFields({
        'x-oss-head1': 'value',
        'content-type': 'text/plain',
        'Content-MD5': 'eB5eJF1ptWaXm4bijSPyxw==',
      }),
    }
    const ctx = context({
      authHeader: true,
      credentials: { accessKeyId: 'ak', accessKeySecret: 'sk' },
      bucket: 'bucket',
      key: '1234+-/123/1.txt',
      region: 'cn-hangzhou',
      product: 'oss',
      signTime: new Date(1702743657 * 1000),
    })
    await new SignerV4().sign(req, ctx)

    expect(ctx.canonicalRequest).toContain('content-md5:eB5eJF1ptWaXm4bijSPyxw==\n')
  })

  it('canonicalizes a bucket with no key as a trailing slash', async () => {
    const req: RequestMessage = {
      method: 'PUT',
      url: 'http://bucket.oss-cn-hangzhou.aliyuncs.com?%2Bparam1=value3&%2Bparam2=&param1=value1&param2=&%7Cparam1=value4&%7Cparam2=',
      headers: createHeaderFields({ 'content-type': 'text/plain' }),
    }
    const ctx = context({
      authHeader: true,
      credentials: { accessKeyId: 'ak', accessKeySecret: 'sk' },
      bucket: 'bucket',
      region: 'cn-hangzhou',
      product: 'oss',
      signTime: new Date(1702743657 * 1000),
    })
    await new SignerV4().sign(req, ctx)

    expect(ctx.canonicalRequest?.split('\n')[1]).toBe('/bucket/')
  })

  it('includes additional headers in both the canonical request and the credential', async () => {
    const req: RequestMessage = {
      method: 'PUT',
      url: 'http://bucket.oss-cn-hangzhou.aliyuncs.com?%2Bparam1=value3&%2Bparam2=&param1=value1&param2=&%7Cparam1=value4&%7Cparam2=',
      headers: createHeaderFields({
        'x-oss-head1': 'value',
        'abc': 'value',
        'ZAbc': 'value',
        'XYZ': 'value',
        'content-type': 'text/plain',
      }),
    }
    const ctx = context({
      authHeader: true,
      credentials: { accessKeyId: 'ak', accessKeySecret: 'sk' },
      bucket: 'bucket',
      key: '1234+-/123/1.txt',
      region: 'cn-hangzhou',
      product: 'oss',
      additionalHeaderNames: ['ZAbc', 'abc'],
      signTime: new Date(1702747512 * 1000),
    })
    await new SignerV4().sign(req, ctx)

    expect(ctx.canonicalRequest).toBe(
      'PUT\n/bucket/1234%2B-/123/1.txt\n' +
        '%2Bparam1=value3&%2Bparam2&%7Cparam1=value4&%7Cparam2&param1=value1&param2\n' +
        'abc:value\ncontent-type:text/plain\nx-oss-content-sha256:UNSIGNED-PAYLOAD\nx-oss-date:20231216T172512Z\nx-oss-head1:value\nzabc:value\n' +
        '\nabc;zabc\nUNSIGNED-PAYLOAD',
    )
    expect(ctx.additionalHeadersToSign).toBe('abc;zabc')
    expect(req.headers.get('Authorization')).toBe(
      'OSS4-HMAC-SHA256 Credential=ak/20231216/cn-hangzhou/oss/aliyun_v4_request,' +
        'AdditionalHeaders=abc;zabc,' +
        'Signature=4a4183c187c07c8947db7620deb0a6b38d9fbdd34187b6dbaccb316fa251212f',
    )
  })

  it('drops additional headers that are absent or already signed by default', async () => {
    const req: RequestMessage = {
      method: 'PUT',
      url: 'http://bucket.oss-cn-hangzhou.aliyuncs.com?%2Bparam1=value3&%2Bparam2=&param1=value1&param2=&%7Cparam1=value4&%7Cparam2=',
      headers: createHeaderFields({
        'x-oss-head1': 'value',
        'abc': 'value',
        'ZAbc': 'value',
        'XYZ': 'value',
        'content-type': 'text/plain',
      }),
    }
    const ctx = context({
      authHeader: true,
      credentials: { accessKeyId: 'ak', accessKeySecret: 'sk' },
      bucket: 'bucket',
      key: '1234+-/123/1.txt',
      region: 'cn-hangzhou',
      product: 'oss',
      additionalHeaderNames: ['x-oss-no-exist', 'ZAbc', 'x-oss-head1', 'abc'],
      signTime: new Date(1702747512 * 1000),
    })
    await new SignerV4().sign(req, ctx)

    // Filtering leaves the same two names, so the signature matches the unfiltered vector.
    expect(ctx.additionalHeadersToSign).toBe('abc;zabc')
    expect(req.headers.get('Authorization')).toBe(
      'OSS4-HMAC-SHA256 Credential=ak/20231216/cn-hangzhou/oss/aliyun_v4_request,' +
        'AdditionalHeaders=abc;zabc,' +
        'Signature=4a4183c187c07c8947db7620deb0a6b38d9fbdd34187b6dbaccb316fa251212f',
    )
  })

  it('drops an additional header that is present but empty', async () => {
    const req: RequestMessage = {
      method: 'PUT',
      url: 'http://bucket.oss-cn-hangzhou.aliyuncs.com?%2Bparam1=value3&%2Bparam2=&param1=value1&param2=&%7Cparam1=value4&%7Cparam2=',
      headers: createHeaderFields({
        'x-oss-head1': 'value',
        'abc': 'value',
        'ZAbc': 'value',
        'content-type': 'text/plain',
        'x-empty': '',
      }),
    }
    const ctx = context({
      authHeader: true,
      credentials: { accessKeyId: 'ak', accessKeySecret: 'sk' },
      bucket: 'bucket',
      key: '1234+-/123/1.txt',
      region: 'cn-hangzhou',
      product: 'oss',
      additionalHeaderNames: ['x-empty', 'ZAbc', 'abc'],
      signTime: new Date(1702747512 * 1000),
    })
    await new SignerV4().sign(req, ctx)

    expect(ctx.additionalHeadersToSign).toBe('abc;zabc')
    expect(ctx.canonicalRequest).not.toContain('x-empty')
  })

  it('sets x-oss-date and Date, and uses UNSIGNED-PAYLOAD', async () => {
    const req: RequestMessage = {
      method: 'PUT',
      url: 'http://bucket.oss-cn-hangzhou.aliyuncs.com/1.txt',
      headers: createHeaderFields({ 'content-type': 'text/plain' }),
    }
    await new SignerV4().sign(
      req,
      context({
        authHeader: true,
        credentials: { accessKeyId: 'ak', accessKeySecret: 'sk' },
        bucket: 'bucket',
        key: '1.txt',
        region: 'cn-hangzhou',
        product: 'oss',
        signTime: new Date(1702743657 * 1000),
      }),
    )

    expect(req.headers.get('x-oss-date')).toBe('20231216T162057Z')
    expect(req.headers.get('Date')).toBe('Sat, 16 Dec 2023 16:20:57 GMT')
    expect(req.headers.get('x-oss-content-sha256')).toBe('UNSIGNED-PAYLOAD')
  })

  it('signs the security token', async () => {
    const req: RequestMessage = {
      method: 'PUT',
      url: 'http://bucket.oss-cn-hangzhou.aliyuncs.com?%2Bparam1=value3&%2Bparam2=&param1=value1&param2=&%7Cparam1=value4&%7Cparam2=',
      headers: createHeaderFields({
        'x-oss-head1': 'value',
        'abc': 'value',
        'ZAbc': 'value',
        'XYZ': 'value',
        'content-type': 'text/plain',
      }),
    }
    const ctx = context({
      authHeader: true,
      credentials: { accessKeyId: 'ak', accessKeySecret: 'sk', securityToken: 'token' },
      bucket: 'bucket',
      key: '1234+-/123/1.txt',
      region: 'cn-hangzhou',
      product: 'oss',
      // The next UTC day, so the scope reads 20231217.
      signTime: new Date(1702784856 * 1000),
    })
    await new SignerV4().sign(req, ctx)

    expect(req.headers.get('x-oss-security-token')).toBe('token')
    expect(req.headers.get('Authorization')).toBe(
      'OSS4-HMAC-SHA256 Credential=ak/20231217/cn-hangzhou/oss/aliyun_v4_request,' +
        'Signature=b94a3f999cf85bcdc00d332fbd3734ba03e48382c36fa4d5af5df817395bd9ea',
    )
  })

  it('signs a cloudbox product and region', async () => {
    const req: RequestMessage = {
      method: 'PUT',
      url: 'http://bucket.oss-cn-hangzhou.aliyuncs.com?%2Bparam1=value3&%2Bparam2=&param1=value1&param2=&%7Cparam1=value4&%7Cparam2=',
      headers: createHeaderFields({
        'x-oss-head1': 'value',
        'abc': 'value',
        'ZAbc': 'value',
        'XYZ': 'value',
        'content-type': 'text/plain',
      }),
    }
    const ctx = context({
      authHeader: true,
      credentials: { accessKeyId: 'ak', accessKeySecret: 'sk' },
      bucket: 'bucket',
      key: '1234+-/123/1.txt',
      region: 'cb-123',
      product: 'oss-cloudbox',
      signTime: new Date(1702743657 * 1000),
    })
    await new SignerV4().sign(req, ctx)

    expect(req.headers.get('Authorization')).toBe(
      'OSS4-HMAC-SHA256 Credential=ak/20231216/cb-123/oss-cloudbox/aliyun_v4_request,' +
        'Signature=94ce1f12c17d148ea681030275a94449d3357f5b5b21133996eec80af3e08a43',
    )
  })

  it('signs many x-oss-meta headers whose names differ only in their punctuation', async () => {
    const req: RequestMessage = {
      method: 'PUT',
      url: 'http://bucket.oss-cn-hangzhou.aliyuncs.com?%2Bparam1=value3&%2Bparam2=&param1=value1&param2=&%7Cparam1=value4&%7Cparam2=',
      headers: createHeaderFields({
        'x-oss-meta-zzz': 'value1',
        'x-oss-meta-aaa': 'value2',
        'x-oss-meta-123': 'value3',
        'x-oss-meta-abc123': 'value4',
        'x-oss-meta-abc-123': 'value5',
        'x-oss-meta-abc_123': 'value6',
        'x-oss-meta-ABC': 'value7',
        'content-type': 'application/json',
        'x-oss-date': '20250814T080624Z',
        'content-md5': 'md5hash',
        'x-oss-content-sha256': 'UNSIGNED-PAYLOAD',
      }),
    }
    const ctx = context({
      authHeader: true,
      credentials: { accessKeyId: 'ak', accessKeySecret: 'sk' },
      bucket: 'bucket',
      key: '1234+-/123/1.txt',
      region: 'cn-hangzhou',
      product: 'oss',
      signTime: new Date(1702743657 * 1000),
    })
    await new SignerV4().sign(req, ctx)

    expect(req.headers.get('x-oss-date')).toBe('20231216T162057Z')
    expect(req.headers.get('Authorization')).toBe(
      'OSS4-HMAC-SHA256 Credential=ak/20231216/cn-hangzhou/oss/aliyun_v4_request,' +
        'Signature=3e9a6ebd7789767059589cc62116d9e4ebc4787e11b937f1683d0f344cf2693e',
    )
  })

  it('re-signs an already-signed request into what a fresh one would carry', async () => {
    const req: RequestMessage = {
      method: 'PUT',
      url: 'http://bucket.oss-cn-hangzhou.aliyuncs.com/1.txt',
      headers: createHeaderFields({ 'x-oss-head1': 'value', 'content-type': 'text/plain' }),
    }
    await new SignerV4().sign(
      req,
      context({
        authHeader: true,
        credentials: { accessKeyId: 'ak', accessKeySecret: 'sk' },
        bucket: 'bucket',
        key: '1.txt',
        region: 'cn-hangzhou',
        product: 'oss',
        signTime: new Date(1702743657 * 1000),
      }),
    )
    const firstAuthorization = req.headers.get('Authorization')
    expect(req.headers.get('x-oss-date')).toBe('20231216T162057Z')

    // 100 seconds later, so the scope date holds and only the instant moves.
    await new SignerV4().sign(
      req,
      context({
        authHeader: true,
        credentials: { accessKeyId: 'ak', accessKeySecret: 'sk' },
        bucket: 'bucket',
        key: '1.txt',
        region: 'cn-hangzhou',
        product: 'oss',
        signTime: new Date(1702743757 * 1000),
      }),
    )
    expect(req.headers.get('x-oss-date')).toBe('20231216T162237Z')
    expect(req.headers.get('Authorization')).not.toBe(firstAuthorization)

    const fresh: RequestMessage = {
      method: 'PUT',
      url: 'http://bucket.oss-cn-hangzhou.aliyuncs.com/1.txt',
      headers: createHeaderFields({ 'x-oss-head1': 'value', 'content-type': 'text/plain' }),
    }
    await new SignerV4().sign(
      fresh,
      context({
        authHeader: true,
        credentials: { accessKeyId: 'ak', accessKeySecret: 'sk' },
        bucket: 'bucket',
        key: '1.txt',
        region: 'cn-hangzhou',
        product: 'oss',
        signTime: new Date(1702743757 * 1000),
      }),
    )
    expect(req.headers.get('Authorization')).toBe(fresh.headers.get('Authorization'))
    expect(req.headers.get('Date')).toBe(fresh.headers.get('Date'))
  })

  it('signs the refreshed token when re-signing with new credentials', async () => {
    const req: RequestMessage = {
      method: 'PUT',
      url: 'http://bucket.oss-cn-hangzhou.aliyuncs.com/1.txt',
      headers: createHeaderFields({ 'content-type': 'text/plain' }),
    }
    await new SignerV4().sign(
      req,
      context({
        authHeader: true,
        credentials: { accessKeyId: 'ak', accessKeySecret: 'sk', securityToken: 'token1' },
        bucket: 'bucket',
        key: '1.txt',
        region: 'cn-hangzhou',
        product: 'oss',
        signTime: new Date(1702743657 * 1000),
      }),
    )
    expect(req.headers.get('x-oss-security-token')).toBe('token1')

    const ctx = context({
      authHeader: true,
      credentials: { accessKeyId: 'ak', accessKeySecret: 'sk', securityToken: 'token2' },
      bucket: 'bucket',
      key: '1.txt',
      region: 'cn-hangzhou',
      product: 'oss',
      signTime: new Date(1702743757 * 1000),
    })
    await new SignerV4().sign(req, ctx)

    expect(req.headers.get('x-oss-security-token')).toBe('token2')
    expect(ctx.canonicalRequest).toContain('x-oss-security-token:token2\n')
  })

  it('signs the fresh security token when the caller left a differently-cased stale one', async () => {
    const req: RequestMessage = {
      method: 'PUT',
      url: 'http://bucket.oss-cn-hangzhou.aliyuncs.com/1.txt',
      headers: createHeaderFields({ 'content-type': 'text/plain', 'X-Oss-Security-Token': 'STALE' }),
    }
    const ctx = context({
      authHeader: true,
      credentials: { accessKeyId: 'ak', accessKeySecret: 'sk', securityToken: 'FRESH' },
      bucket: 'bucket',
      key: '1.txt',
      region: 'cn-hangzhou',
      product: 'oss',
      signTime: new Date(1702743657 * 1000),
    })
    await new SignerV4().sign(req, ctx)

    expect(ctx.canonicalRequest).toContain('x-oss-security-token:FRESH\n')
    expect(ctx.canonicalRequest).not.toContain('STALE')
  })

  it('replaces a caller-supplied Date whatever its case, so only one is sent', async () => {
    const req: RequestMessage = {
      method: 'PUT',
      url: 'http://bucket.oss-cn-hangzhou.aliyuncs.com/1.txt',
      headers: createHeaderFields({ 'content-type': 'text/plain', 'date': 'Mon, 01 Jan 2001 00:00:00 GMT' }),
    }
    await new SignerV4().sign(
      req,
      context({
        authHeader: true,
        credentials: { accessKeyId: 'ak', accessKeySecret: 'sk' },
        bucket: 'bucket',
        key: '1.txt',
        region: 'cn-hangzhou',
        product: 'oss',
        signTime: new Date(1702743657 * 1000),
      }),
    )

    expect(Object.keys(req.headers.toRecord()).filter((k) => k.toLowerCase() === 'date')).toEqual(['Date'])
    expect(req.headers.get('date')).toBe('Sat, 16 Dec 2023 16:20:57 GMT')
  })

  it('sorts canonical headers by name, not by the assembled line', async () => {
    const req: RequestMessage = {
      method: 'PUT',
      url: 'http://bucket.oss-cn-hangzhou.aliyuncs.com/1.txt',
      headers: createHeaderFields({
        'content-type': 'text/plain',
        'x-oss-copy-source-range': 'bytes=0-9',
        'x-oss-copy-source': '/src/obj',
      }),
    }
    const ctx = context({
      authHeader: true,
      credentials: { accessKeyId: 'ak', accessKeySecret: 'sk' },
      bucket: 'bucket',
      key: '1.txt',
      region: 'cn-hangzhou',
      product: 'oss',
      signTime: new Date(1702743657 * 1000),
    })
    await new SignerV4().sign(req, ctx)

    expect(ctx.canonicalRequest).toContain('x-oss-copy-source:/src/obj\nx-oss-copy-source-range:bytes=0-9\n')
  })

  // Two spellings of one name can no longer coexist: `HeaderFields` keys by lowercase, so the second
  // set overwrites the first and only the surviving value is signed.
  it('signs the surviving value when the caller sent two spellings of one signed header', async () => {
    const req: RequestMessage = {
      method: 'PUT',
      url: 'http://bucket.oss-cn-hangzhou.aliyuncs.com?%2Bparam1=value3&%2Bparam2=&param1=value1&param2=&%7Cparam1=value4&%7Cparam2=',
      headers: createHeaderFields({
        'x-oss-head1': 'value',
        'X-Oss-Head1': 'second',
        'content-type': 'text/plain',
      }),
    }
    const ctx = context({
      authHeader: true,
      credentials: { accessKeyId: 'ak', accessKeySecret: 'sk' },
      bucket: 'bucket',
      key: '1234+-/123/1.txt',
      region: 'cn-hangzhou',
      product: 'oss',
      signTime: new Date(1702743657 * 1000),
    })
    await new SignerV4().sign(req, ctx)

    expect(ctx.canonicalRequest).toBe(
      'PUT\n/bucket/1234%2B-/123/1.txt\n' +
        '%2Bparam1=value3&%2Bparam2&%7Cparam1=value4&%7Cparam2&param1=value1&param2\n' +
        'content-type:text/plain\nx-oss-content-sha256:UNSIGNED-PAYLOAD\nx-oss-date:20231216T162057Z\n' +
        'x-oss-head1:second\n' +
        '\n\nUNSIGNED-PAYLOAD',
    )
  })

  it('canonicalizes a bare + in a hand-built query as %20, the space the server decodes it to', async () => {
    const req: RequestMessage = {
      method: 'PUT',
      url: 'http://bucket.oss-cn-hangzhou.aliyuncs.com/?x-oss-process=a+b',
      headers: createHeaderFields({ 'content-type': 'text/plain' }),
    }
    const ctx = context({
      authHeader: true,
      credentials: { accessKeyId: 'ak', accessKeySecret: 'sk' },
      bucket: 'bucket',
      key: '1234+-/123/1.txt',
      region: 'cn-hangzhou',
      product: 'oss',
      signTime: new Date(1702743657 * 1000),
    })
    await new SignerV4().sign(req, ctx)

    expect(ctx.canonicalRequest).toContain('\nx-oss-process=a%20b\n')
  })

  it('derives signTime from the system clock plus clockOffset', async () => {
    const req: RequestMessage = {
      method: 'PUT',
      url: 'http://bucket.oss-cn-hangzhou.aliyuncs.com/1.txt',
      headers: createHeaderFields({ 'content-type': 'text/plain' }),
    }
    const ctx = context({
      authHeader: true,
      credentials: { accessKeyId: 'ak', accessKeySecret: 'sk' },
      bucket: 'bucket',
      key: '1.txt',
      region: 'cn-hangzhou',
      product: 'oss',
      clockOffset: 60_000,
    })

    const before = Date.now()
    await new SignerV4().sign(req, ctx)
    const signed = ctx.signTime?.getTime() ?? 0
    expect(signed).toBeGreaterThanOrEqual(before + 60_000)
    expect(signed).toBeLessThanOrEqual(Date.now() + 60_000)
  })

  it('rejects credentials with an empty key rather than leaving the request unsigned', async () => {
    const req: RequestMessage = {
      method: 'PUT',
      url: 'http://bucket.oss-cn-hangzhou.aliyuncs.com/1.txt',
      headers: createHeaderFields({ 'content-type': 'text/plain' }),
    }
    await expect(
      new SignerV4().sign(
        req,
        context({
          authHeader: true,
          credentials: { accessKeyId: '', accessKeySecret: '' },
          bucket: 'bucket',
          key: '1.txt',
          region: 'cn-hangzhou',
          product: 'oss',
          signTime: new Date(1702743657 * 1000),
        }),
      ),
    ).rejects.toThrow(ParamInvalidError)

    // Nothing was written, so a caller who ignores the rejection cannot send a half-signed request.
    expect(req.headers.get('Authorization')).toBeUndefined()
    expect(req.headers.get('x-oss-date')).toBeUndefined()
  })

  it('rejects an absent credentials field', async () => {
    const req: RequestMessage = {
      method: 'PUT',
      url: 'http://bucket.oss-cn-hangzhou.aliyuncs.com/1.txt',
      headers: createHeaderFields({ 'content-type': 'text/plain' }),
    }
    await expect(
      new SignerV4().sign(
        req,
        context({
          authHeader: true,
          bucket: 'bucket',
          key: '1.txt',
          region: 'cn-hangzhou',
          product: 'oss',
          signTime: new Date(1702743657 * 1000),
        }),
      ),
    ).rejects.toThrow('invalid field, SigningContext.credentials')
  })
})

describe('SignerV4 in query mode', () => {
  it('reproduces the published presign vector', async () => {
    const req: RequestMessage = {
      method: 'PUT',
      url: 'http://bucket.oss-cn-hangzhou.aliyuncs.com?%2Bparam1=value3&%2Bparam2=&param1=value1&param2=&%7Cparam1=value4&%7Cparam2=',
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
      credentials: { accessKeyId: 'ak', accessKeySecret: 'sk' },
      bucket: 'bucket',
      key: '1234+-/123/1.txt',
      region: 'cn-hangzhou',
      product: 'oss',
      signTime: new Date(1702781677 * 1000),
      expirationTime: new Date(1702782276 * 1000),
    })
    await new SignerV4().sign(req, ctx)

    const query = queryOf(req.url)
    expect(query['x-oss-signature-version']).toBe('OSS4-HMAC-SHA256')
    expect(query['x-oss-date']).toBe('20231217T025437Z')
    expect(query['x-oss-expires']).toBe('599')
    expect(query['x-oss-credential']).toBe('ak/20231217/cn-hangzhou/oss/aliyun_v4_request')
    expect(query['x-oss-signature']).toBe('a39966c61718be0d5b14e668088b3fa07601033f6518ac7b523100014269c0fe')
    expect(query['x-oss-additional-headers']).toBeUndefined()
    expect(query['+param1']).toBe('value3')
    expect(query['param2']).toBe('')
  })

  it('sets no header, since whoever replays the URL sends their own', async () => {
    const req: RequestMessage = {
      method: 'PUT',
      url: 'http://bucket.oss-cn-hangzhou.aliyuncs.com?%2Bparam1=value3&%2Bparam2=&param1=value1&param2=&%7Cparam1=value4&%7Cparam2=',
      headers: createHeaderFields({
        'x-oss-head1': 'value',
        'abc': 'value',
        'ZAbc': 'value',
        'XYZ': 'value',
        'content-type': 'application/octet-stream',
      }),
    }
    const before = { ...req.headers }
    await new SignerV4().sign(
      req,
      context({
        authHeader: false,
        credentials: { accessKeyId: 'ak', accessKeySecret: 'sk' },
        bucket: 'bucket',
        key: '1234+-/123/1.txt',
        region: 'cn-hangzhou',
        product: 'oss',
        signTime: new Date(1702781677 * 1000),
        expirationTime: new Date(1702782276 * 1000),
      }),
    )

    expect(req.headers).toEqual(before)
  })

  it('carries the security token in the query and signs it', async () => {
    const req: RequestMessage = {
      method: 'PUT',
      url: 'http://bucket.oss-cn-hangzhou.aliyuncs.com?%2Bparam1=value3&%2Bparam2=&param1=value1&param2=&%7Cparam1=value4&%7Cparam2=',
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
      key: '1234+-/123/1.txt',
      region: 'cn-hangzhou',
      product: 'oss',
      signTime: new Date(1702785388 * 1000),
      expirationTime: new Date(1702785987 * 1000),
    })
    await new SignerV4().sign(req, ctx)

    const query = queryOf(req.url)
    expect(query['x-oss-security-token']).toBe('token')
    expect(query['x-oss-date']).toBe('20231217T035628Z')
    expect(query['x-oss-signature']).toBe('3817ac9d206cd6dfc90f1c09c00be45005602e55898f26f5ddb06d7892e1f8b5')
    expect(req.headers.get('x-oss-security-token')).toBeUndefined()
  })

  it('names the additional headers in the query', async () => {
    const req: RequestMessage = {
      method: 'PUT',
      url: 'http://bucket.oss-cn-hangzhou.aliyuncs.com?%2Bparam1=value3&%2Bparam2=&param1=value1&param2=&%7Cparam1=value4&%7Cparam2=',
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
      credentials: { accessKeyId: 'ak', accessKeySecret: 'sk' },
      bucket: 'bucket',
      key: '1234+-/123/1.txt',
      region: 'cn-hangzhou',
      product: 'oss',
      additionalHeaderNames: ['ZAbc', 'abc'],
      signTime: new Date(1702783809 * 1000),
      expirationTime: new Date(1702784408 * 1000),
    })
    await new SignerV4().sign(req, ctx)

    const query = queryOf(req.url)
    expect(query['x-oss-additional-headers']).toBe('abc;zabc')
    expect(query['x-oss-date']).toBe('20231217T033009Z')
    expect(query['x-oss-signature']).toBe('6bd984bfe531afb6db1f7550983a741b103a8c58e5e14f83ea474c2322dfa2b7')
  })

  it('names only the additional headers that survive filtering', async () => {
    const req: RequestMessage = {
      method: 'PUT',
      url: 'http://bucket.oss-cn-hangzhou.aliyuncs.com?%2Bparam1=value3&%2Bparam2=&param1=value1&param2=&%7Cparam1=value4&%7Cparam2=',
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
      credentials: { accessKeyId: 'ak', accessKeySecret: 'sk' },
      bucket: 'bucket',
      key: '1234+-/123/1.txt',
      region: 'cn-hangzhou',
      product: 'oss',
      additionalHeaderNames: ['x-oss-no-exist', 'abc', 'x-oss-head1', 'ZAbc'],
      signTime: new Date(1702783809 * 1000),
      expirationTime: new Date(1702784408 * 1000),
    })
    await new SignerV4().sign(req, ctx)

    const query = queryOf(req.url)
    expect(query['x-oss-additional-headers']).toBe('abc;zabc')
    expect(query['x-oss-signature']).toBe('6bd984bfe531afb6db1f7550983a741b103a8c58e5e14f83ea474c2322dfa2b7')
  })

  it('signs a cloudbox product and region', async () => {
    const req: RequestMessage = {
      method: 'PUT',
      url: 'http://bucket.oss-cn-hangzhou.aliyuncs.com?%2Bparam1=value3&%2Bparam2=&param1=value1&param2=&%7Cparam1=value4&%7Cparam2=',
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
      credentials: { accessKeyId: 'ak', accessKeySecret: 'sk' },
      bucket: 'bucket',
      key: '1234+-/123/1.txt',
      region: 'cb-123',
      product: 'oss-cloudbox',
      additionalHeaderNames: ['ZAbc', 'abc'],
      signTime: new Date(1702781677 * 1000),
      expirationTime: new Date(1702782276 * 1000),
    })
    await new SignerV4().sign(req, ctx)

    const query = queryOf(req.url)
    expect(query['x-oss-credential']).toBe('ak/20231217/cb-123/oss-cloudbox/aliyun_v4_request')
    expect(query['x-oss-signature']).toBe('07284191b9b4978ac3520cd39ee2dea2747eda454089359371ff463a6c7ba20f')
  })

  it('signs a cloudbox product and region with filtered additional headers', async () => {
    const req: RequestMessage = {
      method: 'PUT',
      url: 'http://bucket.oss-cn-hangzhou.aliyuncs.com?%2Bparam1=value3&%2Bparam2=&param1=value1&param2=&%7Cparam1=value4&%7Cparam2=',
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
      credentials: { accessKeyId: 'ak', accessKeySecret: 'sk' },
      bucket: 'bucket',
      key: '1234+-/123/1.txt',
      region: 'cb-123',
      product: 'oss-cloudbox',
      additionalHeaderNames: ['x-oss-no-exist', 'abc', 'x-oss-head1', 'ZAbc'],
      signTime: new Date(1702783809 * 1000),
      expirationTime: new Date(1702784408 * 1000),
    })
    await new SignerV4().sign(req, ctx)

    const query = queryOf(req.url)
    expect(query['x-oss-credential']).toBe('ak/20231217/cb-123/oss-cloudbox/aliyun_v4_request')
    expect(query['x-oss-date']).toBe('20231217T033009Z')
    expect(query['x-oss-signature']).toBe('16782cc8a7a554523db055eb804b508522e7e370073108ad88ee2f47496701dd')
  })

  it('signs over the previous signature of an already-signed URL as if it were absent', async () => {
    const req: RequestMessage = {
      method: 'PUT',
      url: 'http://bucket.oss-cn-hangzhou.aliyuncs.com?%2Bparam1=value3&%2Bparam2=&param1=value1&param2=&%7Cparam1=value4&%7Cparam2=&x-oss-signature=STALE',
      headers: createHeaderFields({
        'x-oss-head1': 'value',
        'abc': 'value',
        'ZAbc': 'value',
        'XYZ': 'value',
        'content-type': 'application/octet-stream',
      }),
    }
    await new SignerV4().sign(
      req,
      context({
        authHeader: false,
        credentials: { accessKeyId: 'ak', accessKeySecret: 'sk' },
        bucket: 'bucket',
        key: '1234+-/123/1.txt',
        region: 'cn-hangzhou',
        product: 'oss',
        signTime: new Date(1702781677 * 1000),
        expirationTime: new Date(1702782276 * 1000),
      }),
    )

    expect(queryOf(req.url)['x-oss-signature']).toBe(
      'a39966c61718be0d5b14e668088b3fa07601033f6518ac7b523100014269c0fe',
    )
  })

  it('defaults the expiry to fifteen minutes and reports the one it used', async () => {
    const signTime = new Date(1702781677 * 1000)
    const req: RequestMessage = {
      method: 'PUT',
      url: 'http://bucket.oss-cn-hangzhou.aliyuncs.com?%2Bparam1=value3&%2Bparam2=&param1=value1&param2=&%7Cparam1=value4&%7Cparam2=',
      headers: createHeaderFields({
        'x-oss-head1': 'value',
        'content-type': 'application/octet-stream',
      }),
    }
    const ctx = context({
      authHeader: false,
      credentials: { accessKeyId: 'ak', accessKeySecret: 'sk' },
      bucket: 'bucket',
      key: '1234+-/123/1.txt',
      region: 'cn-hangzhou',
      product: 'oss',
      signTime,
    })
    await new SignerV4().sign(req, ctx)

    expect(queryOf(req.url)['x-oss-expires']).toBe('900')
    expect(ctx.expirationTime?.getTime()).toBe(signTime.getTime() + 900_000)
  })
})

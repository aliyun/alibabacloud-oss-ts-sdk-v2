import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import * as sdk from '../../src/index.js'

// Type-only exports are absent from `Object.keys`; `SDK_NAME` and `SDK_VERSION` are internal.
const SURFACE = [
  'AbortMultipartUpload',
  'AnonymousCredentialsProvider',
  'AppendObject',
  'AsyncProcessObject',
  'BytesContent',
  'CanceledError',
  'CleanRestoredObject',
  'Client',
  'ClientErrorRetryable',
  'CompleteMultipartUpload',
  'CopyObject',
  'CredentialsError',
  'DeleteBucket',
  'DeleteMultipleObjects',
  'DeleteObject',
  'DeleteObjectTagging',
  'DescribeRegions',
  'DeserializationError',
  'FeatureFlagsType',
  'FixedDelayBackoff',
  'FullJitterBackoff',
  'GetBucketAcl',
  'GetBucketInfo',
  'GetBucketLocation',
  'GetBucketReferer',
  'GetBucketStat',
  'GetBucketVersioning',
  'GetObject',
  'GetObjectAcl',
  'GetObjectMeta',
  'GetObjectTagging',
  'GetSymlink',
  'HeadObject',
  'HttpStatusCodeRetryable',
  'InitiateMultipartUpload',
  'ListBuckets',
  'ListBucketsPaginator',
  'ListMultipartUploads',
  'ListMultipartUploadsPaginator',
  'ListObjectVersions',
  'ListObjectVersionsPaginator',
  'ListObjects',
  'ListObjectsPaginator',
  'ListObjectsV2',
  'ListObjectsV2Paginator',
  'ListParts',
  'ListPartsPaginator',
  'NopRetryer',
  'NotSupportedError',
  'OperationError',
  'OssError',
  'ParamInvalidError',
  'ParamRequiredError',
  'ProcessObject',
  'PutBucket',
  'PutBucketAcl',
  'PutBucketReferer',
  'PutBucketVersioning',
  'PutObject',
  'PutObjectAcl',
  'PutObjectTagging',
  'PutSymlink',
  'RefreshCredentialsProvider',
  'RequestError',
  'RestoreObject',
  'SerializationError',
  'ServiceError',
  'ServiceErrorCodeRetryable',
  'SignerV1',
  'SignerV4',
  'StandardRetryer',
  'StaticCredentialsProvider',
  'StreamContent',
  'StringContent',
  'UploadPart',
  'UploadPartCopy',
  'UrlStyleType',
  'addMimeType',
  'bytesBody',
  'lookupMimeType',
  'streamBody',
  'stringBody',
]

describe('public surface', () => {
  it('exports exactly the promised names and nothing else', () => {
    expect(Object.keys(sdk).sort()).toEqual(SURFACE)
  })

  it('exports the client and every command', () => {
    expect(typeof sdk.Client).toBe('function')
    expect(typeof sdk.PutObject).toBe('function')
    expect(typeof sdk.GetObject).toBe('function')
    expect(typeof sdk.HeadObject).toBe('function')
    expect(typeof sdk.DeleteObject).toBe('function')
    expect(typeof sdk.CopyObject).toBe('function')
    expect(typeof sdk.AppendObject).toBe('function')
    expect(typeof sdk.DeleteMultipleObjects).toBe('function')
    expect(typeof sdk.GetObjectMeta).toBe('function')
    expect(typeof sdk.RestoreObject).toBe('function')
    expect(typeof sdk.CleanRestoredObject).toBe('function')
    expect(typeof sdk.ListObjectsV2).toBe('function')
    expect(typeof sdk.ListObjects).toBe('function')
    expect(typeof sdk.GetBucketInfo).toBe('function')
    expect(typeof sdk.GetBucketLocation).toBe('function')
    expect(typeof sdk.GetBucketStat).toBe('function')
    expect(typeof sdk.PutBucket).toBe('function')
    expect(typeof sdk.DeleteBucket).toBe('function')
    expect(typeof sdk.PutBucketAcl).toBe('function')
    expect(typeof sdk.GetBucketAcl).toBe('function')
    expect(typeof sdk.PutBucketVersioning).toBe('function')
    expect(typeof sdk.GetBucketVersioning).toBe('function')
    expect(typeof sdk.ListObjectVersions).toBe('function')
    expect(typeof sdk.PutBucketReferer).toBe('function')
    expect(typeof sdk.GetBucketReferer).toBe('function')
    expect(typeof sdk.ListBuckets).toBe('function')
    expect(typeof sdk.DescribeRegions).toBe('function')
    expect(typeof sdk.InitiateMultipartUpload).toBe('function')
    expect(typeof sdk.UploadPart).toBe('function')
    expect(typeof sdk.CompleteMultipartUpload).toBe('function')
    expect(typeof sdk.UploadPartCopy).toBe('function')
    expect(typeof sdk.AbortMultipartUpload).toBe('function')
    expect(typeof sdk.ListMultipartUploads).toBe('function')
    expect(typeof sdk.ListParts).toBe('function')
    expect(typeof sdk.PutObjectAcl).toBe('function')
    expect(typeof sdk.GetObjectAcl).toBe('function')
    expect(typeof sdk.PutObjectTagging).toBe('function')
    expect(typeof sdk.GetObjectTagging).toBe('function')
    expect(typeof sdk.DeleteObjectTagging).toBe('function')
    expect(typeof sdk.PutSymlink).toBe('function')
    expect(typeof sdk.GetSymlink).toBe('function')
  })

  it('exports a paginator for every list command', () => {
    expect(typeof sdk.ListObjectsV2Paginator).toBe('function')
    expect(typeof sdk.ListObjectsPaginator).toBe('function')
    expect(typeof sdk.ListObjectVersionsPaginator).toBe('function')
    expect(typeof sdk.ListMultipartUploadsPaginator).toBe('function')
    expect(typeof sdk.ListPartsPaginator).toBe('function')
    expect(typeof sdk.ListBucketsPaginator).toBe('function')
  })

  it('exports the credentials providers', () => {
    expect(typeof sdk.StaticCredentialsProvider).toBe('function')
    expect(typeof sdk.AnonymousCredentialsProvider).toBe('function')
    expect(typeof sdk.RefreshCredentialsProvider).toBe('function')
  })

  it('exports the signers', () => {
    expect(typeof sdk.SignerV1).toBe('function')
    expect(typeof sdk.SignerV4).toBe('function')
  })

  it('exports the retry implementations', () => {
    expect(typeof sdk.StandardRetryer).toBe('function')
    expect(typeof sdk.NopRetryer).toBe('function')
    expect(typeof sdk.FullJitterBackoff).toBe('function')
    expect(typeof sdk.FixedDelayBackoff).toBe('function')
    expect(typeof sdk.HttpStatusCodeRetryable).toBe('function')
    expect(typeof sdk.ServiceErrorCodeRetryable).toBe('function')
    expect(typeof sdk.ClientErrorRetryable).toBe('function')
  })

  // The numbers are public: `VIRTUAL_HOSTED` being 0 makes it the value an unset field already holds.
  it('exports the addressing styles with their numbers', () => {
    expect(sdk.UrlStyleType.VIRTUAL_HOSTED).toBe(0)
    expect(sdk.UrlStyleType.PATH).toBe(1)
    expect(sdk.UrlStyleType.CNAME).toBe(2)
  })

  it('exports the feature-flag bits a ClientOptionsFn may change', () => {
    expect(sdk.FeatureFlagsType.AUTO_DETECT_MIME_TYPE).toBe(1)
  })

  it('exports the error classes a caller branches on', () => {
    expect(typeof sdk.OssError).toBe('function')
    expect(typeof sdk.ServiceError).toBe('function')
    expect(typeof sdk.OperationError).toBe('function')
    expect(typeof sdk.ParamRequiredError).toBe('function')
    expect(typeof sdk.ParamInvalidError).toBe('function')
    expect(typeof sdk.SerializationError).toBe('function')
    expect(typeof sdk.DeserializationError).toBe('function')
    expect(typeof sdk.CredentialsError).toBe('function')
    expect(typeof sdk.CanceledError).toBe('function')
    expect(typeof sdk.NotSupportedError).toBe('function')
    expect(typeof sdk.OperationError.prototype.contains).toBe('function')
  })

  it('publishes package.json, which is where a caller reads the version', () => {
    const pkg = JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf8')) as {
      exports: Record<string, unknown>
    }
    expect(pkg.exports['./package.json']).toBe('./package.json')
  })
})

describe('the core type-check project', () => {
  const config = JSON.parse(readFileSync(new URL('../../tsconfig.core.json', import.meta.url), 'utf8')) as {
    compilerOptions: { lib?: string[]; types?: string[] }
    include: string[]
    exclude: string[]
  }

  it('covers all of src, so a new directory cannot escape the gate', () => {
    expect(config.include).toContain('src')
  })

  const SWAP_IMPORTERS = ['src/client.ts', 'src/index.ts', 'src/internal/client-impl.ts']

  it('excludes nothing but the platform adapters and what reaches the swapped transport', () => {
    for (const entry of config.exclude) {
      if (SWAP_IMPORTERS.includes(entry)) continue
      expect(entry === 'src/runtime' || entry.startsWith('src/runtime/')).toBe(true)
    }
  })

  it('pins the options that make a platform type an error in both gates', () => {
    expect(config.compilerOptions.types).toEqual([])
    expect(config.compilerOptions.lib).toEqual(['ES2020'])
  })
})

describe('the OpenHarmony type-check project', () => {
  const core = JSON.parse(readFileSync(new URL('../../tsconfig.core.json', import.meta.url), 'utf8')) as {
    exclude: string[]
  }
  const config = JSON.parse(readFileSync(new URL('../../tsconfig.harmony.json', import.meta.url), 'utf8')) as {
    extends: string
    compilerOptions?: unknown
    include: string[]
    exclude: string[]
  }

  it('inherits the no-platform-types options and overrides none of them', () => {
    expect(config.extends).toBe('./tsconfig.core.json')
    expect(
      config.compilerOptions,
      'tsconfig.harmony.json must declare no compilerOptions of its own: it inherits lib/types from ' +
        'tsconfig.core.json, and a local block here either restates them (a no-op that drifts) or ' +
        'overrides them (defeating the gate). Add compiler options to tsconfig.core.json instead, so ' +
        'typecheck:core and typecheck:harmony both receive them.',
    ).toBeUndefined()
  })

  it('covers all of src, whose loss is silent', () => {
    expect(config.include).toContain('src')
  })

  const excludedBy = (list: string[], entry: string): boolean =>
    list.some((each) => entry === each || entry.startsWith(each + '/'))

  it('excludes a subset of what the core project excludes', () => {
    for (const entry of config.exclude) expect(excludedBy(core.exclude, entry)).toBe(true)
  })

  // Representative OpenHarmony runtime files: absent from this exclude, present in core's.
  it.each([
    'src/runtime/harmony/http.ts',
    'src/runtime/harmony/headers.ts',
    'src/runtime/default-transport.harmony.ts',
    'src/runtime/client-extensions.harmony.ts',
    'src/runtime/mime-type.harmony.ts',
    'src/runtime/text-codec.harmony.ts',
  ])('checks %s, which the core project excludes', (entry) => {
    expect(excludedBy(config.exclude, entry)).toBe(false)
    expect(excludedBy(core.exclude, entry)).toBe(true)
  })
})

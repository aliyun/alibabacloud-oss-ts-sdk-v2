# Migration Guide

[Chinese](MIGRATION_CN.md)

This guide describes how to upgrade the OSS SDK for TypeScript/JavaScript from V1 (`ali-oss`) to V2 (`@alicloud/oss-v2`).

## Major breaking changes

- V2 requires Node.js 22 or later.
- V2 is ESM-first with a CommonJS build; V1 ships both ESM and CJS bundles with different entry points.
- The package name changes from `ali-oss` to `@alicloud/oss-v2`.
- V2 defaults to Signature V4, which requires `region`.
- Client construction is unified through a single `Config` object.
- Credentials are supplied via a `CredentialsProvider`, not inline access-key strings.
- Operations are reified as command classes (`PutObject`, `GetObject`, ...) and sent through `client.send()`.
- Method names change from camelCase on the client to PascalCase command classes.
- Results are plain objects, not the `{ data, origRes }` wrapper from V1.
- Errors are thrown as exceptions and wrapped in `OperationError`; V1 returned errors in `result.origRes` or threw raw errors.
- Request bodies use `RequestBody` (`string | Uint8Array | ByteContent`) instead of V1's `data` plus `useStream` flag.
- Pagination is driven by `client.paginate()` with paginator objects instead of manual marker handling.
- Pre-signed URLs are generated with `client.presign()` and return a structured `PresignResult` instead of a plain string.
- Request cancellation uses standard `AbortSignal` instead of V1's cancel flag.

## Minimum Node.js version

V2 requires Node.js 22 or later. V1 supports Node.js 14.21.3 or later.

## Package and import paths

The package name changes from `ali-oss` to `@alicloud/oss-v2`.

| V1 | V2 |
|:---|:---|
| `const OSS = require('ali-oss')` | `import * as oss from '@alicloud/oss-v2'` |
| `import OSS from 'ali-oss'` | `import * as oss from '@alicloud/oss-v2'` |

The V2 module is ESM-first. For CommonJS use the `require` entry under `@alicloud/oss-v2`.

```js
// v1
const OSS = require('ali-oss');
const client = new OSS({ region: 'oss-cn-hangzhou', accessKeyId, accessKeySecret });
```

```ts
// v2
import * as oss from '@alicloud/oss-v2';
const client = new oss.Client({ region: 'cn-hangzhou', credentialsProvider });
```

Platform-specific helpers are exported from subpaths. For example, the Node-only `EnvironmentVariableCredentialsProvider` lives under `@alicloud/oss-v2/node`:

```ts
import { EnvironmentVariableCredentialsProvider } from '@alicloud/oss-v2/node';
```

## Configuration

V2 collects all configuration in a single `Config` object passed to `new oss.Client()`. Credentials and endpoint are no longer separate constructor parameters.

| V1 | V2 | Notes |
|:---|:---|:------|
| `accessKeyId` / `accessKeySecret` / `securityToken` | `credentialsProvider` | Always use a provider |
| `region` | `region` | V2 requires it when `endpoint` is not set |
| `endpoint` | `endpoint` | Optional; derived from `region` when unset |
| `timeout` | `connectTimeoutMs` / `readWriteTimeoutMs` | Split into connection and read/write timeouts |
| `secure` | `disableSsl` | Inverted logic: v1 `secure: false` means HTTP, v2 `disableSsl: true` means HTTP |
| `cname` | `useCname` | Renamed |
| `internal` | `useInternalEndpoint` | Renamed |
| `sldEnable` | `usePathStyle` | V2 uses `usePathStyle` for path-style addressing |
| `isRequestPay` | -- | Set `requestPayer` on each request instead |
| `disabledMD5` | -- | V2 automatically adds Content-MD5 for control-plane APIs, but not for data upload APIs such as `PutObject`; pass `contentMd5` explicitly when you need it |
| `signVersion` | `signerVersion` | Renamed; v2 defaults to `v4` |
| `retryMax` | `retryMaxAttempts` | Renamed |
| `proxy` | `proxyHost` | V2 uses a single URL string |
| `useFetch` | -- | V2 uses its own transport; set `transport` to override |
| `customRequestFunction` | `transport` | Provide a custom `HttpTransport` |
| `cloudBoxId` | -- | Not supported in V2 |

```js
// v1
const client = new OSS({
  region: 'oss-cn-hangzhou',
  accessKeyId: process.env.OSS_ACCESS_KEY_ID,
  accessKeySecret: process.env.OSS_ACCESS_KEY_SECRET,
  timeout: 60000,
  secure: true,
  cname: false,
  internal: false,
});
```

```ts
// v2
import * as oss from '@alicloud/oss-v2';
import { EnvironmentVariableCredentialsProvider } from '@alicloud/oss-v2/node';

const client = new oss.Client({
  region: 'cn-hangzhou',
  credentialsProvider: new EnvironmentVariableCredentialsProvider(),
  connectTimeoutMs: 5000,
  readWriteTimeoutMs: 20000,
});
```

## Create a client

V2 creates a client from `Config` only. Credentials and endpoint move into the config object.

```js
// v1
const client = new OSS({
  region: 'oss-cn-hangzhou',
  accessKeyId: 'ak',
  accessKeySecret: 'sk',
});
```

```ts
// v2
const client = new oss.Client({
  region: 'cn-hangzhou',
  credentialsProvider: new oss.StaticCredentialsProvider('ak', 'sk'),
});
```

## Call API operations

V1 calls API methods directly on the client. V2 uses command classes: construct a `PutObject`, `GetObject`, etc., and pass it to `client.send()`. This makes operations tree-shakable and typed independently.

```js
// v1
const result = await client.putObject({
  bucket: 'mybucket',
  key: 'mykey',
  data: 'hello',
});
```

```ts
// v2
const result = await client.send(
  new oss.PutObject({ bucket: 'mybucket', key: 'mykey', body: 'hello' }),
);
```

Most command classes keep the same PascalCase operation name as the V1 method, but a few are renamed:

| V1 method | V2 command | Notes |
|:---|:---|:------|
| `putObject()` | `PutObject` | Same name, different shape |
| `getObject()` | `GetObject` | Same name, different shape |
| `headObject()` | `HeadObject` | Same name, different shape |
| `deleteObject()` | `DeleteObject` | Same name |
| `copyObject()` | `CopyObject` | Same name |
| `appendObject()` | `AppendObject` | Same name |
| `getObjectMeta()` | `GetObjectMeta` | Same name |
| `restoreObject()` | `RestoreObject` | Same name |
| `deleteMultipleObjects()` | `DeleteMultipleObjects` | Same name |
| `getBucket()` / `listObjects()` | `ListObjects` | Renamed and unified |
| `getBucketV2()` / `listObjectsV2()` | `ListObjectsV2` | Renamed and unified |
| `getBucketVersions()` / `listObjectVersions()` | `ListObjectVersions` | Renamed and unified |
| `initiateMultipartUpload()` | `InitiateMultipartUpload` | Same name |
| `signatureUrl()` | `client.presign()` | Different API; see below |

## Error handling

V1 returned the raw HTTP response in `result.origRes` and sometimes placed error details there. V2 throws exceptions for every failure. Service errors are parsed into `ServiceError` and wrapped in `OperationError`, which names the operation that failed.

| | V1 | V2 |
|:---|:---|:---|
| Success return | `IApiRes<{ data, origRes }>` | Plain `Result` object |
| Failure return | Error thrown or error data inside response | `OperationError` thrown |
| Service error | Inside `result.data` / `result.origRes` | `ServiceError` in cause chain |
| Error code | `result.data.Code` | `service.code` |
| Error message | `result.data.Message` | `service.errorMessage` |
| Request ID | `result.origRes.headers` | `service.requestId` |
| Extended error code | -- | `service.ec` |

```js
// v1
try {
  const result = await client.getObject({ bucket, key });
  console.log(result.data);
} catch (err) {
  console.error(err.message);
}
```

```ts
// v2
try {
  const result = await client.send(new oss.GetObject({ bucket, key }));
  console.log(result);
} catch (error) {
  const service =
    error instanceof oss.OperationError ? error.contains((e) => e instanceof oss.ServiceError) : undefined;
  if (service instanceof oss.ServiceError) {
    console.error('code:      ' + service.code);
    console.error('message:   ' + service.errorMessage);
    console.error('requestId: ' + service.requestId);
  } else {
    console.error('request failed: ' + String(error));
  }
}
```

## Request body

V1 uses a `data` field that accepts `string | ArrayBuffer | T` plus a `useStream` flag. V2 uses the `RequestBody` union (`string | Uint8Array | ByteContent`). Strings and `Uint8Array` are replayable across retries; streams must be wrapped explicitly.

| V1 | V2 |
|:---|:---|
| `data: string` | `body: string` |
| `data: ArrayBuffer` | `body: Uint8Array` |
| `data: stream` with `useStream: true` | `body: streamBody(cursor)` or `readableBody(readable)` |
| File upload | `body: await fileBody(path)` or `client.putObjectFromFile()` |

```js
// v1
await client.putObject({ bucket, key, data: 'hello world' });
```

```ts
// v2
await client.send(new oss.PutObject({ bucket, key, body: 'hello world' }));
```

```js
// v1 -- file
await client.putObject({ bucket, key, data: fs.createReadStream('/path/to/file') });
```

```ts
// v2 -- file
import { fileBody } from '@alicloud/oss-v2/node';

await client.send(
  new oss.PutObject({ bucket, key, body: await fileBody('/path/to/file') }),
);

// or use the convenience helper
await client.putObjectFromFile({ bucket, key }, '/path/to/file');
```

```js
// v1 -- stream
await client.putObject({ bucket, key, data: readable, useStream: true });
```

```ts
// v2 -- stream
import { readableBody } from '@alicloud/oss-v2/node';

await client.send(
  new oss.PutObject({ bucket, key, body: readableBody(readable) }),
);
```

## Response body

V1 returned the raw response body in `result.data` or wrote it to `writeStream`. V2 returns a `ResponseBody` with `bytes()`, `text()` and `stream()` methods, and provides `client.getObjectToFile()` for file downloads.

| V1 | V2 |
|:---|:---|
| `result.data` | `result.body` |
| `result.data` (buffer) | `await result.body.bytes()` |
| `result.data.toString()` | `await result.body.text()` |
| `writeStream` option | `client.getObjectToFile()` or `await result.body.stream()` |

```js
// v1
const result = await client.getObject({ bucket, key });
const text = result.data.toString();
```

```ts
// v2
const result = await client.send(new oss.GetObject({ bucket, key }));
const text = await result.body?.text();
```

```js
// v1 -- download to file
await client.getObject({ bucket, key, writeStream: fs.createWriteStream('/path/to/file') });
```

```ts
// v2 -- download to file
await client.getObjectToFile({ bucket, key }, '/path/to/file');
```

## Pagination

V1 requires manual pagination with `marker`, `continuationToken`, `nextMarker`, etc. V2 provides paginator classes and `client.paginate()` to walk pages automatically.

Supported paginators: `ListObjectsV2Paginator`, `ListObjectsPaginator`, `ListObjectVersionsPaginator`, `ListMultipartUploadsPaginator`, `ListPartsPaginator`, `ListBucketsPaginator`.

```js
// v1 -- manual
let continuationToken;
do {
  const result = await client.listObjectsV2({ bucket, prefix, maxKeys: 100, continuationToken });
  for (const obj of result.data.contents) {
    console.log(obj.key);
  }
  continuationToken = result.data.isTruncated ? result.data.nextContinuationToken : undefined;
} while (continuationToken);
```

```ts
// v2 -- automatic
const paginator = new oss.ListObjectsV2Paginator({ bucket, prefix, maxKeys: 100 });
for await (const page of client.paginate(paginator)) {
  for (const obj of page.contents ?? []) {
    console.log(obj.key);
  }
}
```

## Pre-signed URLs

V1 uses `client.signatureUrl()` and returns a URL string. V2 uses `client.presign()` with a typed command and returns a `PresignResult` containing the URL, HTTP method, expiration, and signed headers.

```js
// v1
const url = await client.signatureUrl({ bucket, key, expires: 3600, method: 'GET' });
```

```ts
// v2
const result = await client.presign(
  new oss.GetObject({ bucket, key }),
  { expiresInSeconds: 3600 },
);
console.log(result.method, result.url, result.signedHeaders);
```

## Request cancellation

V1 uses `client.resetCancelFlag()` and `client.isCancel()`. V2 uses the standard `AbortSignal` passed through `OperationOptions`.

```js
// v1
client.resetCancelFlag();
try {
  await client.getObject({ bucket, key });
} catch (err) {
  if (client.isCancel()) {
    console.log('cancelled');
  }
}
```

```ts
// v2
const controller = new AbortController();
setTimeout(() => controller.abort(), 50);

try {
  await client.send(new oss.GetObject({ bucket, key }), { signal: controller.signal });
} catch (error) {
  if (
    error instanceof oss.CanceledError ||
    (error instanceof oss.OperationError && error.contains((e) => e instanceof oss.CanceledError))
  ) {
    console.log('cancelled');
  }
}
```

## Credentials

V2 requires a `CredentialsProvider`. Built-in providers are `StaticCredentialsProvider`, `RefreshCredentialsProvider`, `AnonymousCredentialsProvider`, and `EnvironmentVariableCredentialsProvider` (Node only). Custom providers implement the `CredentialsProvider` interface.

| V1 | V2 |
|:---|:---|
| Inline `accessKeyId` / `accessKeySecret` | `StaticCredentialsProvider` |
| `refreshCredentials` callback | `RefreshCredentialsProvider` wrapping another provider |
| Anonymous / unsigned requests | `AnonymousCredentialsProvider` |
| Environment variables | `EnvironmentVariableCredentialsProvider` (Node) |

Environment variable names remain the same: `OSS_ACCESS_KEY_ID`, `OSS_ACCESS_KEY_SECRET`, `OSS_SESSION_TOKEN`.

```js
// v1
const client = new OSS({
  region: 'oss-cn-hangzhou',
  accessKeyId: 'ak',
  accessKeySecret: 'sk',
  securityToken: 'token',
});
```

```ts
// v2
const client = new oss.Client({
  region: 'cn-hangzhou',
  credentialsProvider: new oss.StaticCredentialsProvider('ak', 'sk', 'token'),
});
```

```ts
// v2 -- custom provider
const client = new oss.Client({
  region: 'cn-hangzhou',
  credentialsProvider: {
    async getCredentials() {
      const { accessKeyId, accessKeySecret, securityToken } = await fetchCredentials();
      return { accessKeyId, accessKeySecret, securityToken };
    },
  },
});
```

## Multipart upload

V1's multipart methods are client methods. V2 exposes command classes for each step and a `ListPartsPaginator` / `ListMultipartUploadsPaginator` for pagination.

| V1 | V2 |
|:---|:---|
| `initiateMultipartUpload()` | `InitiateMultipartUpload` |
| `uploadPart()` | `UploadPart` |
| `completeMultipartUpload()` | `CompleteMultipartUpload` |
| `abortMultipartUpload()` | `AbortMultipartUpload` |
| `listParts()` | `ListParts` / `ListPartsPaginator` |
| `listMultipartUploads()` | `ListMultipartUploads` / `ListMultipartUploadsPaginator` |
| `uploadPartCopy()` | `UploadPartCopy` |

```js
// v1
const init = await client.initiateMultipartUpload({ bucket, key });
const part = await client.uploadPart({
  bucket,
  key,
  uploadId: init.data.uploadId,
  partNumber: 1,
  data: chunk,
});
await client.completeMultipartUpload({
  bucket,
  key,
  uploadId: init.data.uploadId,
  parts: [{ partNumber: 1, eTag: part.data.etag }],
});
```

```ts
// v2
const init = await client.send(new oss.InitiateMultipartUpload({ bucket, key }));
const part = await client.send(
  new oss.UploadPart({ bucket, key, uploadId: init.uploadId, partNumber: 1, body: chunk }),
);
await client.send(
  new oss.CompleteMultipartUpload({
    bucket,
    key,
    uploadId: init.uploadId,
    parts: [{ partNumber: 1, etag: part.etag }],
  }),
);
```

## Convenience methods

V2 keeps a small set of client helpers that wrap typed commands:

| V1 | V2 |
|:---|:---|
| `client.putObject({ ... , data: fs.createReadStream(path) })` | `client.putObjectFromFile(request, path)` |
| `client.getObject({ ... , writeStream })` | `client.getObjectToFile(request, path)` |
| -- | `client.isObjectExist(bucket, key)` |
| -- | `client.isBucketExist(bucket)` |

```js
// v1
await client.putObject({ bucket, key, data: fs.createReadStream('/path/to/file') });
await client.getObject({ bucket, key, writeStream: fs.createWriteStream('/path/to/file') });
```

```ts
// v2
await client.putObjectFromFile({ bucket, key }, '/path/to/file');
await client.getObjectToFile({ bucket, key }, '/path/to/file');

const exists = await client.isObjectExist(bucket, key);
```

## Generic operations

V2 provides `client.invokeOperation()` for operations the SDK does not model yet. It takes a plain `OperationInput`, signs and retries it like a typed command, and returns a plain `OperationOutput`.

```ts
const output = await client.invokeOperation({
  opName: 'MyCustomOperation',
  method: 'GET',
  bucket,
  key,
  parameters: { foo: 'bar' },
});
console.log(output.statusCode, output.headers);
```

## Retry

Both V1 and V2 enable automatic retry by default. V2 uses exponential backoff with full jitter and exposes `retryMaxAttempts` on `Config` and per-request `OperationOptions`.

| | V1 | V2 |
|:---|:---|:---|
| Default max attempts | 3 | 3 |
| Backoff strategy | Fixed/delay config | Full jitter exponential backoff |
| Configuration | `retryMax` on request handler | `retryMaxAttempts` on `Config` |
| Per-request override | `setRetryMax()` on client | `OperationOptions.retryMaxAttempts` |
| Custom retry predicate | `setRequestErrorShouldRetry()` | Provide a custom `Retryer` |

## HTTP transport

V1 exposes `customRequestFunction` and platform-specific request handlers. V2 uses a platform default transport and exposes the `HttpTransport` interface through `Config.transport`. Node-specific options such as `proxyHost` and `insecureSkipVerify` are passed through `Config` to the default transport.

| V1 | V2 |
|:---|:---|
| `customRequestFunction` | `transport` |
| `useFetch` | -- (V2 selects the platform transport) |
| `proxy` object | `proxyHost` URL string |
| `insecureSkipVerify` | `insecureSkipVerify` |
| `maxSockets` | -- (transport-specific) |

```ts
// v2 -- custom transport
const client = new oss.Client({
  region: 'cn-hangzhou',
  credentialsProvider,
  transport: myCustomTransport,
});
```

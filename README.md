# Alibaba Cloud OSS SDK for TypeScript v2

English | [简体中文](README-CN.md)

alibabacloud-oss-ts-sdk-v2 is the v2 of the OSS SDK for the TypeScript programming language.

## About

> - This TypeScript SDK is based on the official APIs of [Alibaba Cloud OSS](http://www.aliyun.com/product/oss/).
> - Alibaba Cloud Object Storage Service (OSS) is a cloud storage service provided by Alibaba Cloud, featuring massive capacity, security, a low cost, and high reliability.
> - The OSS can store any type of files and therefore applies to various websites, development enterprises and developers.
> - With this SDK, you can upload, download and manage data on any app anytime and anywhere conveniently.

## Features

- **Typed operations** — the specialized API: one command per operation (`PutObject`, `GetObject`, `ListObjectsV2`, …), each a separate named export, that you construct and pass to `client.send` for a typed result.
- **Generic operation** — the generic API: `client.invokeOperation` calls any OSS API the SDK does not model yet, from a plain `OperationInput`, signed and retried exactly like a typed one.
- **Extended operations** — client helpers over the typed operations, like `isObjectExist` / `isBucketExist` (a boolean, not a result) and `putObjectFromFile` / `getObjectToFile` (file transfer where the runtime has a filesystem).
- **Presigned URLs** — `client.presign` for `GetObject`, `PutObject` and the other presignable operations.
- **Pagination** — `client.paginate` walks a list operation (`ListObjectsV2`, `ListObjectVersions`, `ListParts`, `ListBuckets`, …) page by page as an async iterator, following the cursor for you.
- **Automatic retry** — exponential backoff with full jitter for transient failures, configurable or replaceable.
- **Request cancellation** — pass an `AbortSignalLike` the SDK honours in flight.
- **Credential providers** — built-in providers for static, anonymous and environment-variable (Node) credentials, plus `RefreshCredentialsProvider` and custom providers.
- **Tree-shaking friendly** — those command exports are side-effect-free ESM, so a bundle carries only the operations it imports, not the whole API surface.

## Running Environment

- Applicable to `Node.js 22` or above
- Supported platforms:
  - Node.js
  - Browser
  - OpenHarmony (ArkTS)

## Installation

### Install from source

Build the repository, pack it, then install the tarball in your project.

```bash
git clone https://github.com/aliyun/alibabacloud-oss-ts-sdk-v2.git
cd alibabacloud-oss-ts-sdk-v2
npm install
npm run build
npm pack
```

```bash
# in your project, with "@alicloud/oss-v2": "^0.1.0-alpha.0" in package.json;
# --no-save leaves that version range as written
npm install --no-save ../alibabacloud-oss-ts-sdk-v2/alicloud-oss-v2-*.tgz
```

On OpenHarmony the package is a har. Build it from this repository and install that:

```bash
npm install
npm run build:har
```

```bash
# in your project, with "@alicloud/oss-v2": "^0.1.0-alpha.0" in oh-package.json5
ohpm install --no-save ../alibabacloud-oss-ts-sdk-v2/alicloud-oss-v2-*.har
```

See [samples/harmony/INDEX.md](./samples/harmony/INDEX.md) for the platform limitations.

### Install through npm

```bash
npm install @alicloud/oss-v2
```

### Install through ohpm

```bash
ohpm install @alicloud/oss-v2
```

## Quick start

The snippet is ESM — `import` rather than `require`, and a top-level `await` — so it belongs in a
`.mjs` file or in a package with `"type": "module"`.

```ts
import * as process from 'node:process'
import * as oss from '@alicloud/oss-v2'

const client = new oss.Client({
  region: process.env['OSS_REGION'],
  // Optional. Derived from `region` when unset.
  endpoint: process.env['OSS_ENDPOINT'],
  // Both arguments are required strings, so an environment read needs `?? ''`. An empty key is
  // rejected here and now, rather than becoming a signature error from the service later.
  credentialsProvider: new oss.StaticCredentialsProvider(
    process.env['OSS_ACCESS_KEY_ID'] ?? '',
    process.env['OSS_ACCESS_KEY_SECRET'] ?? '',
  ),
})

const result = await client.send(new oss.GetObject({ bucket: 'my-bucket', key: 'sample/hello.txt' }))
console.log('status ' + String(result.statusCode) + ' ' + result.contentType)
console.log(await result.body?.text())
```

## Error handling

When the service reported the failure, `send` rejects with an `OperationError` naming the operation,
and the `ServiceError` carrying the code, message and request id sits down that error's `cause` chain.
When no `ServiceError` is present, inspect the original error and its `cause` chain for details; some
failures are not wrapped — a malformed bucket name, say, arrives bare.

```ts
try {
  const result = await client.send(new oss.GetObject({ bucket: 'my-bucket', key: 'sample/hello.txt' }))
  console.log('status ' + String(result.statusCode))
} catch (error) {
  const service =
    error instanceof oss.OperationError ? error.contains((e) => e instanceof oss.ServiceError) : undefined
  if (service instanceof oss.ServiceError) {
    // `errorMessage`, not `message`: the latter is a composite that already folds in the fields below.
    console.error('operation:  ' + error.opName)
    console.error('code:       ' + service.code)
    console.error('message:    ' + service.errorMessage)
    console.error('requestId:  ' + service.requestId)
    console.error('statusCode: ' + String(service.statusCode))
    console.error('ec:         ' + service.ec)
  } else {
    // There is no service-error metadata or request id to quote; inspect the error chain instead.
    console.error('request failed: ' + String(error))
  }
}
```

## Samples

The [samples](./samples/INDEX.md) directory has a runnable sample for each operation, organised by
platform (Node, browser, OpenHarmony), plus scenario samples for presigning, STS credentials and
cancellation. Node signs with an AccessKey from the environment; a browser or a device signs with STS
credentials from your own backend instead.

## License

Apache License 2.0. See [LICENSE](./LICENSE).

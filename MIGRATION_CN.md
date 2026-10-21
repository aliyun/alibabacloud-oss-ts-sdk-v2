# 迁移指南

[English](MIGRATION.md)

本部分介绍如何从 V1 版本 (`ali-oss`) 迁移到 V2 版本 (`@alicloud/oss-v2`)。

## 主要破坏性变更

- V2 要求 Node.js 22 或更高版本。
- V2 优先使用 ESM，同时提供 CommonJS 构建产物；V1 以不同入口分别输出 ESM 和 CJS。
- 包名从 `ali-oss` 变更为 `@alicloud/oss-v2`。
- V2 默认使用签名 V4，需要设置 `region`。
- 客户端构造统一为单个 `Config` 对象。
- 凭证通过 `CredentialsProvider` 提供，不再直接传入 AccessKey 字符串。
- 操作被封装为命令类（`PutObject`、`GetObject` 等），通过 `client.send()` 发送。
- 方法名从客户端上的驼峰命名变为命令类的 PascalCase 命名。
- 返回结果为普通对象，不再是 V1 的 `{ data, origRes }` 包装。
- 错误以异常形式抛出，并包装为 `OperationError`；V1 将错误放在 `result.origRes` 中或抛出原始错误。
- 请求体使用 `RequestBody`（`string | Uint8Array | ByteContent`），不再使用 V1 的 `data` 加 `useStream` 标志。
- 分页通过 `client.paginate()` 与分页器对象自动完成，不再手动处理 marker。
- 预签名 URL 通过 `client.presign()` 生成，返回结构化的 `PresignResult`，而不是普通字符串。
- 请求取消使用标准 `AbortSignal`，替代 V1 的 cancel 标志。

## 最低 Node.js 版本

V2 版本要求 Node.js 22 或更高版本。V1 版本支持 Node.js 14.21.3 或更高版本。

## 包名与导入路径

包名从 `ali-oss` 变更为 `@alicloud/oss-v2`。

| V1 | V2 |
|:---|:---|
| `const OSS = require('ali-oss')` | `import * as oss from '@alicloud/oss-v2'` |
| `import OSS from 'ali-oss'` | `import * as oss from '@alicloud/oss-v2'` |

V2 模块优先使用 ESM。CommonJS 用户可使用 `@alicloud/oss-v2` 的 `require` 入口。

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

平台相关的辅助函数通过子路径导出。例如，Node 专属的 `EnvironmentVariableCredentialsProvider` 位于 `@alicloud/oss-v2/node`：

```ts
import { EnvironmentVariableCredentialsProvider } from '@alicloud/oss-v2/node';
```

## 配置

V2 将所有配置集中到传给 `new oss.Client()` 的单个 `Config` 对象中。凭证和访问域名不再是独立的构造参数。

| V1 | V2 | 说明 |
|:---|:---|:-----|
| `accessKeyId` / `accessKeySecret` / `securityToken` | `credentialsProvider` | 统一使用凭证提供者 |
| `region` | `region` | V2 在未设置 `endpoint` 时必需 |
| `endpoint` | `endpoint` | 可选；未设置时从 `region` 推导 |
| `timeout` | `connectTimeoutMs` / `readWriteTimeoutMs` | 拆分为连接超时和读写超时 |
| `secure` | `disableSsl` | 逻辑取反：v1 `secure: false` 表示 HTTP，v2 `disableSsl: true` 表示 HTTP |
| `cname` | `useCname` | 重命名 |
| `internal` | `useInternalEndpoint` | 重命名 |
| `sldEnable` | `usePathStyle` | V2 使用 `usePathStyle` 表示路径式访问 |
| `isRequestPay` | -- | 改为在每个请求上设置 `requestPayer` |
| `disabledMD5` | -- | V2 为管控类接口自动添加 Content-MD5，但不为 `PutObject` 等数据上传接口自动计算；需要时由调用方显式传入 `contentMd5` |
| `signVersion` | `signerVersion` | 重命名；v2 默认为 `v4` |
| `retryMax` | `retryMaxAttempts` | 重命名 |
| `proxy` | `proxyHost` | V2 使用单个 URL 字符串 |
| `useFetch` | -- | V2 使用自有传输层；可通过 `transport` 覆盖 |
| `customRequestFunction` | `transport` | 提供自定义 `HttpTransport` |
| `cloudBoxId` | -- | V2 暂不支持 |

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

## 创建 Client

V2 仅通过 `Config` 创建客户端。凭证和访问域名都移入配置对象。

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

## 调用 API 操作

V1 直接在客户端上调用 API 方法。V2 使用命令类：构造 `PutObject`、`GetObject` 等，再传给 `client.send()`。这种方式使操作可按需 tree-shaking，并独立保持类型。

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

大部分命令类保持与 V1 方法名相同的 PascalCase 操作名，少数进行了重命名或统一：

| V1 方法 | V2 命令 | 说明 |
|:---|:---|:-----|
| `putObject()` | `PutObject` | 同名，形态不同 |
| `getObject()` | `GetObject` | 同名，形态不同 |
| `headObject()` | `HeadObject` | 同名，形态不同 |
| `deleteObject()` | `DeleteObject` | 同名 |
| `copyObject()` | `CopyObject` | 同名 |
| `appendObject()` | `AppendObject` | 同名 |
| `getObjectMeta()` | `GetObjectMeta` | 同名 |
| `restoreObject()` | `RestoreObject` | 同名 |
| `deleteMultipleObjects()` | `DeleteMultipleObjects` | 同名 |
| `getBucket()` / `listObjects()` | `ListObjects` | 重命名并统一 |
| `getBucketV2()` / `listObjectsV2()` | `ListObjectsV2` | 重命名并统一 |
| `getBucketVersions()` / `listObjectVersions()` | `ListObjectVersions` | 重命名并统一 |
| `initiateMultipartUpload()` | `InitiateMultipartUpload` | 同名 |
| `signatureUrl()` | `client.presign()` | API 不同；见下文 |

## 错误处理

V1 在 `result.origRes` 中返回原始 HTTP 响应，错误详情有时也放在响应中。V2 对所有失败都抛出异常。服务错误被解析为 `ServiceError`，并包装在 `OperationError` 中，后者会标明失败的操作名。

| | V1 | V2 |
|:---|:---|:---|
| 成功返回 | `IApiRes<{ data, origRes }>` | 普通 `Result` 对象 |
| 失败返回 | 抛出错误或响应中携带错误数据 | 抛出 `OperationError` |
| 服务错误 | `result.data` / `result.origRes` | 位于 cause 链中的 `ServiceError` |
| 错误码 | `result.data.Code` | `service.code` |
| 错误信息 | `result.data.Message` | `service.errorMessage` |
| 请求 ID | `result.origRes.headers` | `service.requestId` |
| 扩展错误码 | -- | `service.ec` |

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

## 请求体

V1 使用 `data` 字段，接受 `string | ArrayBuffer | T` 并配合 `useStream` 标志。V2 使用 `RequestBody` 联合类型（`string | Uint8Array | ByteContent`）。字符串和 `Uint8Array` 可在重试时重放；流需要显式包装。

| V1 | V2 |
|:---|:---|
| `data: string` | `body: string` |
| `data: ArrayBuffer` | `body: Uint8Array` |
| `data: stream` 且 `useStream: true` | `body: streamBody(cursor)` 或 `readableBody(readable)` |
| 文件上传 | `body: await fileBody(path)` 或 `client.putObjectFromFile()` |

```js
// v1
await client.putObject({ bucket, key, data: 'hello world' });
```

```ts
// v2
await client.send(new oss.PutObject({ bucket, key, body: 'hello world' }));
```

```js
// v1 -- 文件
await client.putObject({ bucket, key, data: fs.createReadStream('/path/to/file') });
```

```ts
// v2 -- 文件
import { fileBody } from '@alicloud/oss-v2/node';

await client.send(
  new oss.PutObject({ bucket, key, body: await fileBody('/path/to/file') }),
);

// 或使用便捷方法
await client.putObjectFromFile({ bucket, key }, '/path/to/file');
```

```js
// v1 -- 流
await client.putObject({ bucket, key, data: readable, useStream: true });
```

```ts
// v2 -- 流
import { readableBody } from '@alicloud/oss-v2/node';

await client.send(
  new oss.PutObject({ bucket, key, body: readableBody(readable) }),
);
```

## 响应体

V1 在 `result.data` 中返回原始响应体，或写入 `writeStream`。V2 返回 `ResponseBody`，提供 `bytes()`、`text()` 和 `stream()` 方法，并提供 `client.getObjectToFile()` 用于下载到文件。

| V1 | V2 |
|:---|:---|
| `result.data` | `result.body` |
| `result.data`（buffer） | `await result.body.bytes()` |
| `result.data.toString()` | `await result.body.text()` |
| `writeStream` 选项 | `client.getObjectToFile()` 或 `await result.body.stream()` |

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
// v1 -- 下载到文件
await client.getObject({ bucket, key, writeStream: fs.createWriteStream('/path/to/file') });
```

```ts
// v2 -- 下载到文件
await client.getObjectToFile({ bucket, key }, '/path/to/file');
```

## 分页

V1 需要手动处理 `marker`、`continuationToken`、`nextMarker` 等分页标记。V2 提供分页器类和 `client.paginate()` 自动遍历页面。

支持的分页器：`ListObjectsV2Paginator`、`ListObjectsPaginator`、`ListObjectVersionsPaginator`、`ListMultipartUploadsPaginator`、`ListPartsPaginator`、`ListBucketsPaginator`。

```js
// v1 -- 手动分页
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
// v2 -- 自动分页
const paginator = new oss.ListObjectsV2Paginator({ bucket, prefix, maxKeys: 100 });
for await (const page of client.paginate(paginator)) {
  for (const obj of page.contents ?? []) {
    console.log(obj.key);
  }
}
```

## 预签名 URL

V1 使用 `client.signatureUrl()` 返回 URL 字符串。V2 使用 `client.presign()` 配合类型化命令，返回包含 URL、HTTP 方法、过期时间和签名请求头的 `PresignResult`。

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

## 请求取消

V1 使用 `client.resetCancelFlag()` 和 `client.isCancel()`。V2 通过 `OperationOptions` 传入标准 `AbortSignal`。

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

## 凭证

V2 要求使用 `CredentialsProvider`。内置提供者有 `StaticCredentialsProvider`、`RefreshCredentialsProvider`、`AnonymousCredentialsProvider` 以及 Node 专属的 `EnvironmentVariableCredentialsProvider`。自定义提供者实现 `CredentialsProvider` 接口即可。

| V1 | V2 |
|:---|:---|
| 直接传入 `accessKeyId` / `accessKeySecret` | `StaticCredentialsProvider` |
| `refreshCredentials` 回调 | 用 `RefreshCredentialsProvider` 包装另一个提供者 |
| 匿名 / 免签名请求 | `AnonymousCredentialsProvider` |
| 环境变量 | `EnvironmentVariableCredentialsProvider`（Node） |

环境变量名称保持不变：`OSS_ACCESS_KEY_ID`、`OSS_ACCESS_KEY_SECRET`、`OSS_SESSION_TOKEN`。

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
// v2 -- 自定义提供者
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

## 分片上传

V1 的分片方法是客户端方法。V2 为每一步暴露命令类，并提供 `ListPartsPaginator` / `ListMultipartUploadsPaginator` 用于分页。

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

## 便捷方法

V2 保留了一小部分封装 typed command 的客户端辅助方法：

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

## 泛化操作

V2 提供 `client.invokeOperation()`，用于调用 SDK 尚未建模的操作。它接收普通 `OperationInput`，像 typed command 一样签名和重试，并返回普通 `OperationOutput`。

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

## 重试

V1 和 V2 均默认开启自动重试。V2 使用带抖动的指数退避，并在 `Config` 上暴露 `retryMaxAttempts`，同时支持每次请求通过 `OperationOptions` 覆盖。

| | V1 | V2 |
|:---|:---|:---|
| 默认最大尝试次数 | 3 | 3 |
| 退避策略 | 固定/延迟配置 | 带抖动的指数退避 |
| 配置方式 | request handler 上的 `retryMax` | `Config` 上的 `retryMaxAttempts` |
| 单请求覆盖 | 客户端 `setRetryMax()` | `OperationOptions.retryMaxAttempts` |
| 自定义重试判断 | `setRequestErrorShouldRetry()` | 提供自定义 `Retryer` |

## HTTP 传输

V1 暴露 `customRequestFunction` 和平台相关的请求处理器。V2 使用平台默认传输层，并通过 `Config.transport` 暴露 `HttpTransport` 接口。Node 专属选项如 `proxyHost`、`insecureSkipVerify` 通过 `Config` 传给默认传输层。

| V1 | V2 |
|:---|:---|
| `customRequestFunction` | `transport` |
| `useFetch` | --（V2 选择平台传输层） |
| `proxy` 对象 | `proxyHost` URL 字符串 |
| `insecureSkipVerify` | `insecureSkipVerify` |
| `maxSockets` | --（传输层相关） |

```ts
// v2 -- 自定义传输层
const client = new oss.Client({
  region: 'cn-hangzhou',
  credentialsProvider,
  transport: myCustomTransport,
});
```

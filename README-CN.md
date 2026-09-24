# Alibaba Cloud OSS SDK for TypeScript v2

[English](README.md) | 简体中文

alibabacloud-oss-ts-sdk-v2 是 OSS 面向 TypeScript 的第二版 SDK。

## 关于

> - 此 TypeScript SDK 基于[阿里云对象存储服务](http://www.aliyun.com/product/oss/)官方 API 构建。
> - 阿里云对象存储（Object Storage Service，简称 OSS）是阿里云提供的海量、安全、低成本、高可靠的云存储服务。
> - OSS 适合存放任意类型的文件，适用于各种网站、开发企业及开发者。
> - 使用此 SDK，您可以方便地在任何应用、任何时间、任何地点上传、下载和管理数据。

## 特性

- **类型化操作** — 专用 API：每个操作对应一个命令（`PutObject`、`GetObject`、`ListObjectsV2` 等），每个都是独立的具名导出；构造命令后传给 `client.send`，即可获得类型化结果。
- **泛化操作** — 泛化 API：通过普通的 `OperationInput` 调用 `client.invokeOperation`，可以访问 SDK 尚未建模的任意 OSS API；请求会像类型化操作一样经过签名和重试。
- **扩展操作** — 构建在类型化操作之上的客户端辅助方法，例如 `isObjectExist` / `isBucketExist`（返回布尔值而非结果）以及 `putObjectFromFile` / `getObjectToFile`（在具备文件系统的运行时进行文件收发）。
- **预签名 URL** — 通过 `client.presign` 为 `GetObject`、`PutObject` 及其他支持预签名的操作生成 URL。
- **分页器** — `client.paginate` 以异步迭代器的方式逐页遍历列举操作（`ListObjectsV2`、`ListObjectVersions`、`ListParts`、`ListBuckets` 等），并自动跟踪翻页游标。
- **自动重试** — 针对瞬时故障采用带完全抖动的指数退避策略，可进行配置或替换。
- **请求取消** — 传入 `AbortSignalLike`，即可取消正在执行的请求。
- **凭证提供者** — 内置静态凭证、匿名凭证、环境变量凭证（Node）提供者，同时支持 `RefreshCredentialsProvider` 和自定义提供者。
- **Tree-shaking 友好** — 命令采用无副作用的 ESM 具名导出，因此打包结果只包含实际导入的操作，而非完整 API。

## 环境要求

- Node.js 22 及以上版本
- 支持平台：
  - Node.js
  - 浏览器
  - OpenHarmony（ArkTS）

## 安装方法

### 通过源码安装

构建本仓库并打包，然后在您的项目中安装生成的 tarball。

```bash
git clone https://github.com/aliyun/alibabacloud-oss-ts-sdk-v2.git
cd alibabacloud-oss-ts-sdk-v2
npm install
npm run build
npm pack
```

```bash
# 在您的项目中，先在 package.json 中配置 "@alicloud/oss-v2": "^0.1.0-alpha.0"；
# --no-save 会保留已配置的版本范围
npm install --no-save ../alibabacloud-oss-ts-sdk-v2/alicloud-oss-v2-*.tgz
```

在 OpenHarmony 上，SDK 以 HAR 包的形式使用。请从本仓库构建并安装：

```bash
npm install
npm run build:har
```

```bash
# 在您的项目中，先在 oh-package.json5 中配置 "@alicloud/oss-v2": "^0.1.0-alpha.0"
ohpm install --no-save ../alibabacloud-oss-ts-sdk-v2/alicloud-oss-v2-*.har
```

平台限制请参阅 [samples/harmony/INDEX.md](./samples/harmony/INDEX.md)。

### 通过 npm 安装

```bash
npm install @alicloud/oss-v2
```

### 通过 ohpm 安装

```bash
ohpm install @alicloud/oss-v2
```

## 快速开始

以下代码使用 ESM，即通过 `import` 而不是 `require` 导入，并使用顶层 `await`。请将其放在 `.mjs` 文件中，或在配置了 `"type": "module"` 的包中运行。

```ts
import * as process from 'node:process'
import * as oss from '@alicloud/oss-v2'

const client = new oss.Client({
  region: process.env['OSS_REGION'],
  // 可选。未设置时将根据 region 推导。
  endpoint: process.env['OSS_ENDPOINT'],
  // 两个参数都必须是字符串，因此读取环境变量时需要使用 ?? ''。
  // 空密钥会立即被拒绝，而不是在请求服务端后才产生签名错误。
  credentialsProvider: new oss.StaticCredentialsProvider(
    process.env['OSS_ACCESS_KEY_ID'] ?? '',
    process.env['OSS_ACCESS_KEY_SECRET'] ?? '',
  ),
})

const result = await client.send(new oss.GetObject({ bucket: 'my-bucket', key: 'sample/hello.txt' }))
console.log('status ' + String(result.statusCode) + ' ' + result.contentType)
console.log(await result.body?.text())
```

## 错误处理

当服务端返回失败响应时，`send` 会抛出一个标明操作名称的 `OperationError`；真正携带错误码、错误信息和请求 ID 的 `ServiceError`，则在它的 `cause` 链中。若错误链里没有 `ServiceError`，可顺着原始错误及其 `cause` 链排查；有些错误不会被包装，例如 Bucket 名称格式错误就会直接抛出。

```ts
try {
  const result = await client.send(new oss.GetObject({ bucket: 'my-bucket', key: 'sample/hello.txt' }))
  console.log('status ' + String(result.statusCode))
} catch (error) {
  const service =
    error instanceof oss.OperationError ? error.contains((e) => e instanceof oss.ServiceError) : undefined
  if (service instanceof oss.ServiceError) {
    // 使用 errorMessage 而非 message：message 已经组合了下列字段。
    console.error('operation:  ' + error.opName)
    console.error('code:       ' + service.code)
    console.error('message:    ' + service.errorMessage)
    console.error('requestId:  ' + service.requestId)
    console.error('statusCode: ' + String(service.statusCode))
    console.error('ec:         ' + service.ec)
  } else {
    // 此时没有可输出的服务端错误元数据或请求 ID，请继续检查错误链。
    console.error('request failed: ' + String(error))
  }
}
```

## 示例

[`samples`](./samples/INDEX.md) 目录按平台（Node、浏览器、OpenHarmony）组织，为每个操作提供可运行示例，并包含预签名、STS 凭证和请求取消等场景示例。Node 使用环境变量中的 AccessKey 进行签名；浏览器或设备端应使用从您自己的后端获取的 STS 凭证进行签名。

## 许可协议

Apache License 2.0，请参阅 [LICENSE](./LICENSE)。

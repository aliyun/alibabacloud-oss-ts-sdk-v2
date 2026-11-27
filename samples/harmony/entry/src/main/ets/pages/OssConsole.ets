import { picker } from '@kit.CoreFileKit'
import { common } from '@kit.AbilityKit'
import fs from '@ohos.file.fs'
import { BusinessError } from '@ohos.base'
import {
  Client,
  fileBody,
  DeleteBucket,
  DeleteObject,
  FileSinkFactory,
  FileSinkOptions,
  GetObject,
  HeadObject,
  ListObjectsV2,
  OperationError,
  OperationInput,
  OperationOutput,
  PresignOptions,
  ProgressHandler,
  PutBucket,
  PutObject,
  ServiceError,
  StaticCredentialsProvider,
} from '@alicloud/oss-v2'

interface UploadCallbacks {
  progressHandler: ProgressHandler
}

/** Puts an object and reports upload progress through the callback `Client.send` already reads. */
class PutObjectUpload {
  readonly opName: string = 'PutObject'
  readonly input: Object
  private readonly command: PutObject
  private readonly handler: ProgressHandler

  constructor(command: PutObject, handler: ProgressHandler) {
    this.command = command
    this.input = command.input
    this.handler = handler
  }

  serialize(_input: Object): Promise<OperationInput> {
    return this.command.serialize(this.command.input)
  }

  deserialize(output: OperationOutput) {
    return this.command.deserialize(output)
  }

  serializeInner(_input: Object): UploadCallbacks {
    const callbacks: UploadCallbacks = { progressHandler: this.handler }
    return callbacks
  }
}

function fileNameOf(uri: string): string {
  const path = uri.split('?')[0]
  const slash = path.lastIndexOf('/')
  const raw = slash >= 0 ? path.substring(slash + 1) : path
  return decodeURIComponent(raw)
}

/** ArkUI console for the same calls the `api/` samples make. Credentials stay in this page. */
@Component
export struct OssConsole {
  @State accessKeyId: string = ''
  @State accessKeySecret: string = ''
  @State securityToken: string = ''
  @State region: string = 'cn-hangzhou'
  @State endpoint: string = ''
  @State bucketName: string = ''
  @State objectKey: string = 'sample/hello.txt'
  @State prefix: string = 'sample/'
  @State bodyText: string = 'hello from the OSS TypeScript SDK'
  @State selectedUri: string = ''
  @State selectedName: string = ''
  @State showProgress: boolean = false
  @State uploadPercent: number = 0
  @State downloadPath: string = ''
  @State partSizeText: string = ''
  @State concurrencyText: string = '1'
  @State downloadPercent: number = 0
  @State output: string = ''

  build() {
    Scroll() {
      Column({ space: 12 }) {
        Text('填 STS 临时凭据。不要把长期 AccessKey 写进应用。')
          .fontSize(13)
          .fontColor('#666666')
          .width('100%')

        this.field('AccessKey ID', this.accessKeyId, (value: string) => { this.accessKeyId = value }, true)
        this.field('AccessKey Secret', this.accessKeySecret, (value: string) => { this.accessKeySecret = value }, true)
        this.field('Security Token', this.securityToken, (value: string) => { this.securityToken = value }, true)
        this.field('Region', this.region, (value: string) => { this.region = value }, false)
        this.field('Endpoint（可空）', this.endpoint, (value: string) => { this.endpoint = value }, false)
        this.field('Bucket', this.bucketName, (value: string) => { this.bucketName = value }, false)

        Text('Bucket').fontSize(16).width('100%')
        Flex({ wrap: FlexWrap.Wrap }) {
          Button('PutBucket').onClick(() => { this.putBucket() })
          Button('DeleteBucket').onClick(() => { this.deleteBucket() })
          Button('ListObjects').onClick(() => { this.listObjects() })
        }.width('100%')

        Text('Object').fontSize(16).width('100%')
        this.field('Object key', this.objectKey, (value: string) => { this.objectKey = value }, false)
        this.field('前缀', this.prefix, (value: string) => { this.prefix = value }, false)
        TextArea({ text: this.bodyText, placeholder: '上传内容' })
          .height(80)
          .width('100%')
          .onChange((value: string) => { this.bodyText = value })
        Button('选择本地文件').onClick(() => { this.pickFile() })
        Text(this.selectedName.length > 0 ? '已选文件: ' + this.selectedName : '未选文件时上传文本框内容')
          .fontSize(12)
          .fontColor('#666666')
          .width('100%')
        Row({ space: 8 }) {
          Checkbox()
            .select(this.showProgress)
            .onChange((value: boolean) => { this.showProgress = value })
          Text('显示上传进度').fontSize(13)
        }.width('100%')
        if (this.showProgress) {
          Progress({ value: this.uploadPercent, total: 100, type: ProgressType.Linear })
            .width('100%')
            .height(12)
            .color('#0A59F7')
        }
        Flex({ wrap: FlexWrap.Wrap }) {
          Button('PutObject').onClick(() => { this.putObject() })
          Button('HeadObject').onClick(() => { this.headObject() })
          Button('DeleteObject').onClick(() => { this.deleteObject() })
        }.width('100%')

        Text('下载').fontSize(16).width('100%')
        this.field('下载路径（空则写到缓存目录）', this.downloadPath, (value: string) => { this.downloadPath = value }, false)
        this.field('分片大小（字节，空为对象的 1/10）', this.partSizeText, (value: string) => { this.partSizeText = value }, false)
        this.field('并发数（1 为顺序）', this.concurrencyText, (value: string) => { this.concurrencyText = value }, false)
        Progress({ value: this.downloadPercent, total: 100, type: ProgressType.Linear })
          .width('100%')
          .height(12)
          .color('#0A59F7')
        Flex({ wrap: FlexWrap.Wrap }) {
          Button('下载到内存').onClick(() => { this.getObject() })
          Button('下载到文件').onClick(() => { this.getObjectToFile() })
          Button('分片下载').onClick(() => { this.downloadInParts() })
        }.width('100%')

        Text('Presign').fontSize(16).width('100%')
        Flex({ wrap: FlexWrap.Wrap }) {
          Button('Put URL').onClick(() => { this.presignPut() })
          Button('Get URL').onClick(() => { this.presignGet() })
          Button('Head URL').onClick(() => { this.presignHead() })
        }.width('100%')

        Text(this.output.length > 0 ? this.output : '结果出现在这里')
          .fontSize(13)
          .fontColor('#222222')
          .width('100%')
      }
      .padding(16)
      .width('100%')
    }
    .width('100%')
    .height('100%')
    .backgroundColor('#FFFFFF')
  }

  @Builder
  field(label: string, value: string, onChange: (value: string) => void, secret: boolean) {
    Column({ space: 4 }) {

      Text(label).fontSize(12).fontColor('#888888').width('100%')
      TextInput({ text: value, placeholder: label })
        .type(secret ? InputType.Password : InputType.Normal)
        .height(40)
        .width('100%')
        .onChange(onChange)
    }.width('100%')
  }

  private client(): Client {
    const endpoint = this.endpoint.length > 0 ? this.endpoint : undefined
    return new Client({
      region: this.region,
      endpoint: endpoint,
      credentialsProvider: new StaticCredentialsProvider(
        this.accessKeyId,
        this.accessKeySecret,
        this.securityToken,
      ),
    })
  }

  private run(task: () => Promise<string>): void {
    this.output = '请求中…'
    task().then((text: string) => {
      this.output = text
    }).catch((error: Object) => {
      this.output = this.describe(error)
    })
  }

  private putBucket(): void {
    const name = this.bucketName
    this.run(async (): Promise<string> => {
      const result = await this.client().send(new PutBucket({
        bucket: name,
        acl: 'private',
        createBucketConfiguration: { storageClass: 'Standard' },
      }))
      return 'created ' + name + '\nstatus: ' + result.statusCode + '\nrequestId: ' + result.requestId
    })
  }

  private deleteBucket(): void {
    const name = this.bucketName
    this.run(async (): Promise<string> => {
      const result = await this.client().send(new DeleteBucket({ bucket: name }))
      return 'deleted ' + name + '\nstatus: ' + result.statusCode
    })
  }

  private listObjects(): void {
    const name = this.bucketName
    const prefix = this.prefix
    this.run(async (): Promise<string> => {
      const result = await this.client().send(new ListObjectsV2({
        bucket: name,
        prefix: prefix,
        maxKeys: 100,
      }))
      const lines: string[] = []
      const contents = result.contents ?? []
      for (let i = 0; i < contents.length; i++) {
        const entry = contents[i]
        lines.push(entry.key + '  ' + entry.size + ' B')
      }
      if (lines.length === 0) {
        return 'prefix ' + prefix + ': no keys'
      }
      return 'prefix ' + prefix + ': ' + lines.length + ' keys\n' + lines.join('\n')
    })
  }

  private pickFile(): void {
    const documentPicker = new picker.DocumentViewPicker()
    const selectOptions = new picker.DocumentSelectOptions()
    selectOptions.maxSelectNumber = 1
    documentPicker.select(selectOptions).then((uris: Array<string>) => {
      if (uris.length === 0) {
        return
      }
      const uri = uris[0]
      const name = fileNameOf(uri)
      this.selectedUri = uri
      this.selectedName = name
      const prefix = this.prefix.length > 0 && !this.prefix.endsWith('/') ? this.prefix + '/' : this.prefix
      this.objectKey = prefix + name
    }).catch((error: BusinessError) => {
      if (error.code === 1001) {
        return
      }
      this.output = '选择文件失败\n' + error.code + ' ' + error.message
    })
  }

  private putObject(): void {
    const name = this.bucketName
    const key = this.objectKey
    const bodyText = this.bodyText
    const fileUri = this.selectedUri
    const showProgress = this.showProgress
    this.uploadPercent = 0
    this.run(async (): Promise<string> => {
      const command = fileUri.length > 0
        ? new PutObject({ bucket: name, key: key, body: await fileBody(fileUri) })
        : new PutObject({ bucket: name, key: key, body: bodyText, contentType: 'text/plain' })
      const handler: ProgressHandler = (_increment: number, transferred: number, total: number): void => {
        if (total > 0) {
          const percent = Math.round((transferred * 100) / total)
          this.uploadPercent = percent > 100 ? 100 : percent
        }
      }
      const result = showProgress
        ? await this.client().send(new PutObjectUpload(command, handler))
        : await this.client().send(command)
      if (showProgress) {
        this.uploadPercent = 100
      }
      return 'uploaded ' + key + '\netag: ' + result.etag + '\nrequestId: ' + result.requestId
    })
  }

  private getObject(): void {
    const name = this.bucketName
    const key = this.objectKey
    this.run(async (): Promise<string> => {
      const result = await this.client().send(new GetObject({ bucket: name, key: key }))
      const body = (await result.body?.text()) ?? ''
      const shown = body.length > 512 ? body.slice(0, 512) + ' …' : body
      return 'downloaded ' + key + ' into memory\ncontentType: ' + result.contentType + '\nbody:\n' + shown
    })
  }

  private getObjectToFile(): void {
    const name = this.bucketName
    const key = this.objectKey
    const path = this.downloadTarget(key)
    this.downloadPercent = 0
    this.run(async (): Promise<string> => {
      const result = await this.client().getObjectToFile({ bucket: name, key: key }, path)
      this.downloadPercent = 100
      return 'downloaded ' + key + ' to ' + path + '\nstatus: ' + result.statusCode
    })
  }

  private downloadInParts(): void {
    const name = this.bucketName
    const key = this.objectKey
    const path = this.downloadTarget(key)
    const partText = this.partSizeText
    const concurrency = this.concurrency()
    this.downloadPercent = 0
    this.run(async (): Promise<string> => {
      const head = await this.client().send(new HeadObject({ bucket: name, key: key }))
      const size = head.contentLength ?? -1
      if (size < 0) {
        return '对象没有 Content-Length，不能分片'
      }
      const partSize = this.partSize(size, partText)
      await this.prepareDownloadFile(path)
      if (size === 0) {
        this.downloadPercent = 100
        return 'downloaded ' + key + ' to ' + path + '\nsize: 0\nparts: 0'
      }
      const parts = await this.writeRanges(name, key, path, size, partSize, concurrency)
      this.downloadPercent = 100
      return 'downloaded ' + key + ' to ' + path +
        '\nsize: ' + size +
        '\npartSize: ' + partSize +
        '\nparts: ' + parts +
        '\nconcurrency: ' + concurrency
    })
  }

  private downloadTarget(key: string): string {
    if (this.downloadPath.length > 0) {
      return this.downloadPath
    }
    const slash = key.lastIndexOf('/')
    const name = slash >= 0 ? key.substring(slash + 1) : key
    const fileName = name.length > 0 ? name : 'object.bin'
    const context = this.getUIContext().getHostContext() as common.UIAbilityContext
    return context.cacheDir + '/' + fileName
  }

  private partSize(objectSize: number, text: string): number {
    const parsed = Number.parseInt(text, 10)
    if (parsed >= 1) {
      return parsed > objectSize ? objectSize : parsed
    }
    const tenth = Math.floor(objectSize / 10)
    return tenth >= 1 ? tenth : 1
  }

  private concurrency(): number {
    const parsed = Number.parseInt(this.concurrencyText, 10)
    return parsed >= 1 ? parsed : 1
  }

  private async prepareDownloadFile(path: string): Promise<void> {
    const opened = await fs.open(path, fs.OpenMode.WRITE_ONLY | fs.OpenMode.CREATE | fs.OpenMode.TRUNC)
    await fs.close(opened)
  }

  private async writeRanges(
    bucket: string,
    key: string,
    path: string,
    size: number,
    partSize: number,
    width: number,
  ): Promise<number> {
    const starts: number[] = []
    let cursor = 0
    while (cursor < size) {
      starts.push(cursor)
      const step = partSize < size - cursor ? partSize : size - cursor
      cursor += step
    }
    const total = starts.length
    let next = 0
    let written = 0
    const client = this.client()
    const runOne = async (): Promise<void> => {
      while (next < total) {
        const index = next
        next = next + 1
        const start = starts[index]
        const length = index + 1 < total ? starts[index + 1] - start : size - start
        const end = start + length - 1
        const sinkOptions: FileSinkOptions = { offset: start }
        await client.send(new GetObject({
          bucket: bucket,
          key: key,
          range: 'bytes=' + start.toString() + '-' + end.toString(),
          sinkFactory: new FileSinkFactory(path, sinkOptions),
        }))
        written = written + length
        const percent = Math.round((written * 100) / size)
        this.downloadPercent = percent > 100 ? 100 : percent
      }
    }
    const jobs: Promise<void>[] = []
    let workers = width
    if (workers > total) {
      workers = total
    }
    for (let i = 0; i < workers; i++) {
      jobs.push(runOne())
    }
    await Promise.all(jobs)
    return total
  }

  private headObject(): void {
    const name = this.bucketName
    const key = this.objectKey
    this.run(async (): Promise<string> => {
      const result = await this.client().send(new HeadObject({ bucket: name, key: key }))
      return 'metadata for ' + key +
        '\netag: ' + result.etag +
        '\nlastModified: ' + result.lastModified +
        '\nstorageClass: ' + result.storageClass
    })
  }

  private deleteObject(): void {
    const name = this.bucketName
    const key = this.objectKey
    this.run(async (): Promise<string> => {
      const result = await this.client().send(new DeleteObject({ bucket: name, key: key }))
      return 'deleted ' + key + '\nstatus: ' + result.statusCode
    })
  }

  private presignPut(): void {
    this.presign('PUT')
  }

  private presignGet(): void {
    this.presign('GET')
  }

  private presignHead(): void {
    this.presign('HEAD')
  }

  private presign(method: string): void {
    const name = this.bucketName
    const key = this.objectKey
    this.run(async (): Promise<string> => {
      const client = this.client()
      const options: PresignOptions = { expiresInSeconds: 600 }
      if (method === 'PUT') {
        const result = await client.presign(new PutObject({ bucket: name, key: key }), options)
        return result.method + '\n' + result.url
      }
      if (method === 'HEAD') {
        const result = await client.presign(new HeadObject({ bucket: name, key: key }), options)
        return result.method + '\n' + result.url
      }
      const result = await client.presign(new GetObject({ bucket: name, key: key }), options)
      return result.method + '\n' + result.url
    })
  }

  private describe(error: Object): string {
    if (error instanceof OperationError) {
      const service = error.contains((cause: Error): boolean => cause instanceof ServiceError)
      if (service instanceof ServiceError) {
        return 'request failed\noperation: ' + error.opName +
          '\ncode: ' + service.code +
          '\nmessage: ' + service.errorMessage +
          '\nrequestId: ' + service.requestId +
          '\nstatusCode: ' + service.statusCode
      }
      return 'request failed\n' + error.message

    }
    if (error instanceof Error) {
      return error.message
    }
    return '' + error
  }
}

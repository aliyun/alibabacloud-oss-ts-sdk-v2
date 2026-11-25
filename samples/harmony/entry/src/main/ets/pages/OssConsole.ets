import { picker } from '@kit.CoreFileKit'
import fs from '@ohos.file.fs'
import { BusinessError } from '@ohos.base'
import {
  Client,
  DeleteBucket,
  DeleteObject,
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

async function readLocalFile(uri: string): Promise<Uint8Array> {
  const stat = await fs.stat(uri)
  const file = await fs.open(uri, fs.OpenMode.READ_ONLY)
  try {
    const buffer = new ArrayBuffer(stat.size)
    const read = await fs.read(file.fd, buffer, { offset: 0, length: stat.size })
    return new Uint8Array(buffer, 0, read)
  } finally {
    await fs.close(file)
  }
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
          Button('GetObject').onClick(() => { this.getObject() })
          Button('HeadObject').onClick(() => { this.headObject() })
          Button('DeleteObject').onClick(() => { this.deleteObject() })
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
        ? new PutObject({ bucket: name, key: key, body: await readLocalFile(fileUri) })
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
      return 'downloaded ' + key + '\ncontentType: ' + result.contentType + '\nbody:\n' + shown
    })
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

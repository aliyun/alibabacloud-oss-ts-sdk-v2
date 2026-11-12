import {
  Client,
  DeleteBucket,
  DeleteObject,
  GetObject,
  HeadObject,
  ListObjectsV2,
  OperationError,
  PresignOptions,
  PutBucket,
  PutObject,
  ServiceError,
  StaticCredentialsProvider,
} from '@alicloud/oss-v2'

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

  private putObject(): void {
    const name = this.bucketName
    const key = this.objectKey
    const body = this.bodyText
    this.run(async (): Promise<string> => {
      const result = await this.client().send(new PutObject({
        bucket: name,
        key: key,
        body: body,
        contentType: 'text/plain',
      }))
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

import { run } from '../api/PutObject'

@Entry
@Component
struct Index {
  @State message: string = 'OSS SDK verify build'

  build() {
    Column() {
      Text(this.message)
        .fontSize(24)
        .onClick(() => {
          run().catch((error: Error) => {
            console.error('verify run failed: ' + error)
          })
        })
    }
    .height('100%')
    .width('100%')
  }
}

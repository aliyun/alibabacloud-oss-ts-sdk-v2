import { OssConsole } from './OssConsole'

@Entry
@Component
struct Index {
  build() {
    Column() {
      OssConsole()
    }
    .width('100%')
    .height('100%')
  }
}

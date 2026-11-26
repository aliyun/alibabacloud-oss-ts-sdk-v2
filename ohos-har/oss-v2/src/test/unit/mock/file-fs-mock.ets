class MockOpenMode {
  readonly READ_ONLY: number = 0
  readonly WRITE_ONLY: number = 1
  readonly CREATE: number = 64
  readonly TRUNC: number = 512
}

class MockFileIo {
  readonly OpenMode: MockOpenMode = new MockOpenMode()

  open(_path: string, _mode: number): void {
    throw new Error('File access is unavailable in this unit test.')
  }

  read(_fd: number, _buffer: ArrayBuffer, _options: object): void {
    throw new Error('File access is unavailable in this unit test.')
  }

  write(_fd: number, _buffer: ArrayBuffer, _options: object): void {
    throw new Error('File access is unavailable in this unit test.')
  }

  close(_fd: number): void {
    throw new Error('File access is unavailable in this unit test.')
  }

  stat(_path: string): void {
    throw new Error('File access is unavailable in this unit test.')
  }
}

export default new MockFileIo()

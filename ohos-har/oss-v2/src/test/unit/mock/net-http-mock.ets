class MockNetHttp {
  createHttp(): void {
    throw new Error('The mock transport must be injected through Config.transport.')
  }
}

export default new MockNetHttp()

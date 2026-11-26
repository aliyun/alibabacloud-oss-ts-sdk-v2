import type { HarmonyHttpModule, HttpRequest, HarmonyRequestOptions } from '../../src/runtime/harmony/http.js'

// Stand-in for the device-only `@ohos.net.http` that records requests.
export const calls: HarmonyRequestOptions[] = []

// Streaming calls, recorded apart from the buffered ones so a test can tell which path a send took.
export const streamCalls: HarmonyRequestOptions[] = []

const http: HarmonyHttpModule = {
  HttpDataType: { ARRAY_BUFFER: 2 },
  createHttp: (): HttpRequest => ({
    request(_url: string, options: HarmonyRequestOptions) {
      calls.push(options)
      return Promise.resolve({ responseCode: 200, header: {}, result: '' })
    },
    requestInStream(_url: string, options: HarmonyRequestOptions) {
      streamCalls.push(options)
      return Promise.resolve(200)
    },
    on(): void {},
    off(): void {},
    destroy(): void {},
  }),
}

export default http

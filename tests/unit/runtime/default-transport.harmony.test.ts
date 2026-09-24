import { beforeEach, describe, expect, it } from 'vitest'
import { createDefaultTransport } from '../../../src/runtime/default-transport.harmony.js'
import { calls } from '../../fixtures/ohos-net-http.js'
import type { RequestMessage } from '../../../src/transport/types.js'
import { createHeaderFields } from '../../../src/utils/header-fields.js'

const request: RequestMessage = { method: 'GET', url: 'https://bucket.oss-cn-hangzhou.aliyuncs.com/k', headers: createHeaderFields() }

beforeEach(() => {
  calls.length = 0
})

describe('the OpenHarmony createDefaultTransport', () => {
  it('builds a transport, so a client needs no Config.transport here either', async () => {
    await createDefaultTransport().send(request, {})

    expect(calls.length).toBe(1)
  })

  it('passes the network settings it was given to netstack', async () => {
    await createDefaultTransport({ connectTimeoutMs: 3_000 }).send(request, {})

    expect(calls[0].connectTimeout).toBe(3_000)
  })
})

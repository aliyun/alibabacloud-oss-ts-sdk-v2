import { describe, expect, it } from 'vitest'
import { DescribeRegions, ListBuckets } from '../../src/index.js'
import { live, liveClient } from './fixtures/live.js'

describe.skipIf(!live)('service operations against the live service', () => {
  const client = liveClient()

  it('ListBuckets reports the owner and returns a listing', async () => {
    const result = await client.send(new ListBuckets({ maxKeys: 100 }))

    expect(result.statusCode).toBe(200)
    expect(result.owner?.id).toBeDefined()
    // `buckets` is absent, not `[]`, when the account owns none, so this only asserts the shape when
    // present rather than assuming a specific bucket the concurrent suites may not have created yet.
    if (result.buckets !== undefined) {
      expect(Array.isArray(result.buckets)).toBe(true)
      expect(result.buckets.every((each) => typeof each.name === 'string')).toBe(true)
    }
  })

  it('DescribeRegions lists every region with its public and internal endpoints', async () => {
    const result = await client.send(new DescribeRegions({}))

    expect(result.statusCode).toBe(200)
    const regions = result.regionInfo ?? []
    expect(regions.length).toBeGreaterThan(0)
    expect(regions[0].region).toBeDefined()
    expect(regions[0].internetEndpoint).toBeDefined()
    expect(regions[0].internalEndpoint).toBeDefined()
  })

  it('DescribeRegions filters to a single region when one is named', async () => {
    const result = await client.send(new DescribeRegions({ regions: 'oss-cn-hangzhou' }))

    expect(result.statusCode).toBe(200)
    const regions = result.regionInfo ?? []
    expect(regions.length).toBe(1)
    expect(regions[0].region).toBe('oss-cn-hangzhou')
  })
})

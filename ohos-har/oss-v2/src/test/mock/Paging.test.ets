import { describe, expect, it } from '@ohos/hypium'
import { ListObjectsV2Paginator } from '../../../Index'
import { BUCKET, createClient, probeCount } from './Stubs'

/**
 * The cursor loop over the real transport. The stub only answers the second page for a request that carries
 * `continuation-token=tok-2`, so a dropped cursor shows up as a 500 rather than as a passing case.
 */
export default function pagingTest() {
  describe('Harmony pagination over loopback', () => {
    it('walks ListObjectsV2 pages until the cursor runs out', 0, async () => {
      const path = '/' + BUCKET + '/'
      const keys: string[] = []
      let pages: number = 0
      for await (const page of createClient().paginate(new ListObjectsV2Paginator({ bucket: BUCKET, maxKeys: 1 }))) {
        pages += 1
        for (const object of page.contents ?? []) {
          keys.push(object.key ?? '')
        }
      }

      expect(pages).assertEqual(2)
      expect(keys.join(',')).assertEqual('dir/a.txt,dir/b.txt')
      expect(await probeCount('count', 'GET', path)).assertEqual(1)
      expect(await probeCount('count', 'GET', path, '&continuation-token=tok-2')).assertEqual(1)
    })
  })
}

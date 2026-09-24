import { describe, expect, it } from '@ohos/hypium';
import { Client, GetObject, StaticCredentialsProvider } from '@alicloud/oss-v2';

export default function ossHarmonyRuntimeTest(): void {
  describe('OssHarmonyRuntime', () => {
    it('percent-encodes a non-ASCII key when presigning', 0, async () => {
      const client = new Client({
        region: 'cn-hangzhou',
        credentialsProvider: new StaticCredentialsProvider('id', 'secret', ''),
      });
      const result = await client.presign(new GetObject({ bucket: 'my-bucket', key: 'sample/中文.txt' }), {
        expiresInSeconds: 600,
      });
      expect(result.url).assertContain('/sample/%E4%B8%AD%E6%96%87.txt');
    });
  });
}

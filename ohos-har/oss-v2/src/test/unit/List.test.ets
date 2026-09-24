import clientServiceTest from './ClientService.test'
import clientBucketBasicTest from './ClientBucketBasic.test'
import clientObjectBasicTest from './ClientObjectBasic.test'
import clientErrorsTest from './ClientErrors.test'
import clientMiscTest from './ClientMisc.test'

export default function testsuite() {
  clientServiceTest()
  clientBucketBasicTest()
  clientObjectBasicTest()
  clientErrorsTest()
  clientMiscTest()
}

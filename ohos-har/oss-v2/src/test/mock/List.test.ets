import errorsTest from './Errors.test'
import pagingTest from './Paging.test'
import transportTest from './Transport.test'

export default function testsuite() {
  transportTest()
  errorsTest()
  pagingTest()
}

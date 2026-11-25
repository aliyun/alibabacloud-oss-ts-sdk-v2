import unitTestsuite from './unit/List.test'
import mockTestsuite from './mock/List.test'

export default function testsuite() {
  unitTestsuite()
  mockTestsuite()
}

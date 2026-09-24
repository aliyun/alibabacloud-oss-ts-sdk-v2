import type { ExecuteContext } from '../../src/internal/execute-context.js'
import type { SigningContext } from '../../src/signer/types.js'

function signingContext(): SigningContext {
  return {
    authHeader: true,
    stringToSign: '',
    dateToSign: '',
    scopeToSign: '',
    additionalHeadersToSign: '',
  }
}

export function executeContext(): ExecuteContext {
  return { signingContext: signingContext() }
}

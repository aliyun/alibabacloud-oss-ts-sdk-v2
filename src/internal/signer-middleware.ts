import type { ExecuteContext } from './execute-context.js'
import { AnonymousCredentialsProvider } from '../credentials/anonymous.js'
import { hasKeys } from '../credentials/types.js'
import type { Credentials, CredentialsProvider } from '../credentials/types.js'
import { CredentialsError, OssError, ParamRequiredError } from '../error/types.js'
import type { Logger } from '../log/logger.js'
import type { Signer } from '../signer/types.js'
import type { RequestMessage, ResponseMessage } from '../transport/types.js'
import type { ExecuteMiddleware } from './execute-middleware.js'

/** Fetches credentials, signs the request, and forwards it. */
export class SignerMiddleware implements ExecuteMiddleware {
  private readonly next: ExecuteMiddleware
  private readonly signer: Signer
  private readonly provider?: CredentialsProvider
  private readonly logger?: Logger

  constructor(next: ExecuteMiddleware, signer: Signer, provider?: CredentialsProvider, logger?: Logger) {
    this.next = next
    this.signer = signer
    this.provider = provider
    this.logger = logger
  }

  async execute(request: RequestMessage, context: ExecuteContext): Promise<ResponseMessage> {
    const provider = this.provider
    if (provider === undefined) throw new ParamRequiredError('Config.credentialsProvider')
    if (provider instanceof AnonymousCredentialsProvider) {
      return await this.next.execute(request, context)
    }

    let credentials: Credentials
    try {
      credentials = await provider.getCredentials()
    } catch (err) {
      throw new CredentialsError(
        'failed to fetch credentials from the provider',
        err instanceof Error ? err : new OssError('the credentials provider threw a value that was not an Error'),
      )
    }

    if (!hasKeys(credentials)) {
      throw new CredentialsError('the credentials provider returned credentials with no access key id or secret')
    }

    const signingContext = context.signingContext
    signingContext.credentials = credentials
    await this.signer.sign(request, signingContext)
    this.logger?.debug('stringToSign:\n' + signingContext.stringToSign)

    return await this.next.execute(request, context)
  }
}

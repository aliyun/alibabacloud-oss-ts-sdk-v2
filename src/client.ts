import { GetBucketAcl } from './api/bucket-acl.js'
import { GetObjectMeta } from './api/object-basic.js'
import type { Config } from './config.js'
import { OperationError, OssError, ServiceError } from './error/types.js'
import { ClientImpl } from './internal/client-impl.js'
import type {
  GetObjectRequest,
  GetObjectResult,
  PutObjectRequest,
  PutObjectResult,
} from './models/object-basic.js'
import { getObjectToFile, putObjectFromFile } from './runtime/client-extensions.js'
import type {
  ClientOptionsFn,
  Command,
  OperationInput,
  OperationOutput,
  OperationOptions,
  Paginator,
  Presignable,
  PresignOptions,
  PresignResult,
} from './types.js'

/** The client every operation is sent through. Create one and reuse it. */
export class Client {
  private readonly impl: ClientImpl

  /** Applies each `ClientOptionsFn` in order. Configuration errors are reported on the first call. */
  constructor(config: Config, ...fns: ClientOptionsFn[]) {
    this.impl = new ClientImpl(config, fns)
  }

  /** Runs an operation the SDK does not model, signed and retried like any other. */
  invokeOperation(input: OperationInput, options?: OperationOptions): Promise<OperationOutput> {
    return this.impl.invokeOperation(input, options)
  }

  /**
   * Runs one operation and returns its result. A failure arrives as an `OperationError` naming the
   * operation, with the cause under it -- or, for a value rejected before anything is sent, as the
   * `ParamRequiredError` or `ParamInvalidError` itself.
   */
  async send<I, O>(command: Command<I, O>, options?: OperationOptions): Promise<O> {
    let input: OperationInput
    try {
      input = await command.serialize(command.input)
    } catch (err) {
      throw new OperationError(
        command.opName,
        err instanceof Error ? err : new OssError('serialize threw a value that was not an Error'),
      )
    }

    const innerOptions = command.serializeInner?.(command.input)
    const output = await this.impl.invokeOperation(input, options, innerOptions)

    try {
      return await command.deserialize(output)
    } catch (err) {
      throw new OperationError(
        command.opName,
        err instanceof Error ? err : new OssError('deserialize threw a value that was not an Error'),
      )
    }
  }

  /**
   * Signs one operation into a URL that carries it on its own, and sends nothing. Only a command that
   * implements `Presignable` can be presigned; a V4 URL may not outlive seven days.
   */
  async presign<I, O>(command: Presignable<I, O>, options?: PresignOptions): Promise<PresignResult> {
    let input: OperationInput
    try {
      input = await command.serializePresign(command.input)
    } catch (err) {
      throw new OperationError(
        command.opName,
        err instanceof Error ? err : new OssError('serializePresign threw a value that was not an Error'),
      )
    }

    return await this.impl.presignOperation(input, options)
  }

  /**
   * Walks a list operation page by page, yielding each result. Consume it with `for await`. Only a
   * paginator from `src/paginator` can be passed; each page is a `client.send`, so a failure arrives
   * exactly as it would from a direct call.
   */
  paginate<O>(paginator: Paginator<O>, options?: OperationOptions): AsyncGenerator<O> {
    return paginator.pages(this, options)
  }

  /** Returns whether an object exists. A missing bucket or every error other than a missing key is rethrown. */
  async isObjectExist(bucket: string, key: string, options?: OperationOptions): Promise<boolean> {
    try {
      await this.send(new GetObjectMeta({ bucket, key }), options)
      return true
    } catch (err) {
      if (!(err instanceof OperationError)) throw err
      const service = err.contains((inner) => inner instanceof ServiceError)
      if (!(service instanceof ServiceError)) throw err
      if (service.statusCode === 404 && (service.code === 'NoSuchKey' || service.code === 'BadErrorResponse')) {
        return false
      }
      throw err
    }
  }

  /** Returns whether a bucket exists. A service response other than `NoSuchBucket` establishes that it exists. */
  async isBucketExist(bucket: string, options?: OperationOptions): Promise<boolean> {
    try {
      await this.send(new GetBucketAcl({ bucket }), options)
      return true
    } catch (err) {
      if (!(err instanceof OperationError)) throw err
      const service = err.contains((inner) => inner instanceof ServiceError)
      if (!(service instanceof ServiceError)) throw err
      if (service.code === 'NoSuchBucket') return false
      if (service.statusCode > 0) return true
      throw err
    }
  }

  /** Uploads the file at `path` as an object where the current runtime supports local files. */
  async putObjectFromFile(
    request: PutObjectRequest,
    path: string,
    options?: OperationOptions,
  ): Promise<PutObjectResult> {
    return await putObjectFromFile(this, request, path, options)
  }

  /** Downloads an object into `path` where the current runtime supports local files. */
  async getObjectToFile(
    request: GetObjectRequest,
    path: string,
    options?: OperationOptions,
  ): Promise<GetObjectResult> {
    return await getObjectToFile(this, request, path, options)
  }
}

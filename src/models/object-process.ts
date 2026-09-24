import type { RequestModel, ResultModel } from './common.js'

/** The request for the ProcessObject operation. */
export interface ProcessObjectRequest extends RequestModel {
  /** The name of the bucket. Required. */
  bucket?: string
  /** The full path of the object. Required. */
  key?: string
  /**
   * The processing instruction, e.g. `image/resize,w_100|sys/saveas,o_<base64>,b_<base64>`. Required,
   * sent in the request body.
   */
  process?: string
}

/** The result for the ProcessObject operation. */
export interface ProcessObjectResult extends ResultModel {
  /** The raw JSON response body, e.g. `{"bucket":"","fileSize":3267,"object":"dest.jpg","status":"OK"}`. */
  body?: string
}

/** The request for the AsyncProcessObject operation. */
export interface AsyncProcessObjectRequest extends RequestModel {
  /** The name of the bucket. Required. */
  bucket?: string
  /** The full path of the object. Required. */
  key?: string
  /**
   * The async processing instruction, e.g. `video/convert,f_mp4|sys/saveas,o_<base64>,b_<base64>`.
   * Required, sent in the request body.
   */
  process?: string
}

/** The result for the AsyncProcessObject operation. */
export interface AsyncProcessObjectResult extends ResultModel {
  /** The raw JSON response body, carrying the `EventId`, `RequestId` and `TaskId` of the async task. */
  body?: string
}

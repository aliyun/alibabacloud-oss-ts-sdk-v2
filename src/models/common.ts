/**
 * What every request model extends. These two maps are the escape hatch: when OSS ships a header or
 * query parameter the SDK has not modelled yet, set it here.
 *
 * Serializers copy these first, then overwrite them with modelled fields.
 */
export interface RequestModel {
  headers?: Record<string, string>
  parameters?: Record<string, string>
}

/**
 * What every result model extends. `headers` is lowercased and `requestId` is `''` when absent.
 */
export interface ResultModel {
  status: string
  statusCode: number
  requestId: string
  headers: Record<string, string>
}

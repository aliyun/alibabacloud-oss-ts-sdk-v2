import type { RequestMessage } from '../transport/types.js'

/** Node and the browser send the content type the caller set. */
export function tuneRequestForSigning(_request: RequestMessage): void {}

/**
 * Resolves after roughly `delayMs`. Used by the retry backoff.
 *
 * A pending timer keeps a Node event loop alive for its duration, which a backoff needs: the process
 * must not exit mid-wait.
 */
export function sleep(delayMs: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, delayMs))
}

/**
 * The ports of the loopback stub run. `scripts/run-harmony-test.mjs` rewrites this file with the ports the
 * stub bound and reserved, then restores it after the test task; a compiled constant is the only value the
 * Previewer shares with the host.
 */
export const STUB_PORT: string = '56791'

/** A port nothing listens on, for the connection-refused case. */
export const DEAD_PORT: string = '56792'

/**
 * The port the loopback stub listens on. `scripts/run-harmony-test.mjs` rewrites this file with the port it
 * bound, then restores it after the test task; a compiled constant is the only value the Previewer shares.
 */
export const STUB_PORT: string = '45678'

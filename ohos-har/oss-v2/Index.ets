export * from './src/main/ets/index'
// OpenHarmony ships by har rather than as an npm subpath, so the file sink the har serves has no other
// entry point. The root export stays platform-neutral.
export * from './src/main/ets/runtime/harmony/index'

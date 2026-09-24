declare module '@ohos.file.fs' {
  // eslint-disable-next-line @typescript-eslint/consistent-type-imports
  const fileIo: import('../src/runtime/harmony/file-content.js').HarmonyFileFs
  export default fileIo
}

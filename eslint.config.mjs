import tseslint from 'typescript-eslint'

const notAPropertyName = `:not(${[
  'MemberExpression[computed=false] > Identifier.property',
  'Property[computed=false] > Identifier.key',
  'PropertyDefinition[computed=false] > Identifier.key',
  'MethodDefinition[computed=false] > Identifier.key',
  'TSAbstractPropertyDefinition[computed=false] > Identifier.key',
  'TSAbstractMethodDefinition[computed=false] > Identifier.key',
  'TSPropertySignature[computed=false] > Identifier.key',
  'TSMethodSignature[computed=false] > Identifier.key',
  'TSEnumMember > Identifier.id',
].join(', ')})`

/** AST selectors approximating the ArkTS language subset. §9 gate 1. */
const arktsRestrictedSyntax = [
  { selector: 'TSAnyKeyword', message: 'ArkTS forbids `any` (arkts-no-any-unknown, 10605008). Declare the real type; if the value arrives from outside, narrow it with `instanceof` at the boundary and take the concrete type here. A structural stand-in is not the way out -- ArkTS has no structural typing (10605030), so a shape that merely looks right is not a type relationship.' },
  { selector: 'TSUnknownKeyword', message: 'ArkTS forbids `unknown` as well as `any` (arkts-no-any-unknown, 10605008). Narrow at the boundary with `instanceof` and take the concrete type here.' },
  { selector: 'TSIntersectionType', message: 'ArkTS forbids intersection types (arkts-no-intersection-types, 10605019). Use inheritance, or declare one interface with all the members.' },
  { selector: 'TSTypeLiteral', message: 'ArkTS forbids object literal types (arkts-no-obj-literals-as-types, 10605040). Declare a class or interface. As a cast target it is worse than it looks: ArkTS has no structural typing (10605030) and a bad `as` throws ClassCastException at runtime (10605053), so reading an undeclared field this way fails on device, not at compile time.' },
  { selector: 'UnaryExpression[operator="delete"]', message: 'ArkTS forbids `delete`. Assign undefined to the property, or rebuild the object without it.' },
  { selector: 'TSModuleDeclaration[kind="namespace"]', message: 'ArkTS forbids `namespace`. Put the declarations in their own module file and export them.' },
  { selector: 'WithStatement', message: 'ArkTS forbids `with`. Name the object and access its properties explicitly.' },
  { selector: 'ForInStatement', message: 'ArkTS forbids `for...in`: object layout is fixed at compile time. Iterate `Object.keys(obj)` (or `Object.entries(obj)`) with `for...of` instead.' },
  { selector: 'CallExpression[callee.name="eval"]', message: 'ArkTS forbids `eval`: there is no runtime code evaluation. Write the logic out.' },
  { selector: `Identifier[name="arguments"]${notAPropertyName}`, message: 'ArkTS forbids the `arguments` object. Declare a rest parameter (`...args: T[]`) instead.' },
  { selector: 'Identifier[name="__proto__"]', message: 'ArkTS forbids prototype manipulation. Declare the property on the type instead.' },
  { selector: 'MemberExpression[object.name="Object"][property.name=/^(setPrototypeOf|getPrototypeOf|defineProperty|defineProperties|assign)$/]', message: 'ArkTS forbids prototype/descriptor manipulation and does not reliably support Object.assign. Copy the fields explicitly, e.g. by looping over Object.keys().' },
  { selector: `Identifier[name="Symbol"]${notAPropertyName}`, message: 'ArkTS support for Symbol is limited, so the SDK uses none (§4). Key data off a normal property or a module-level map rather than a symbol, and iterate with an explicit method instead of Symbol.iterator.' },
  { selector: 'Decorator', message: 'Only ArkUI decorators are permitted on OpenHarmony, and none of them belong in an SDK. Remove the decorator and call the behaviour directly.' },
  { selector: 'TSIndexSignature', message: 'Use Record<string, string> instead of an index signature.' },
  { selector: 'ObjectExpression > SpreadElement', message: 'ArkTS forbids object spread (arkts-no-spread): only arrays, Array subclasses and TypedArray can be spread, and only into a rest argument or an array literal. Use copyInto from src/utils/record.ts to merge objects.' },
  { selector: ':matches(ClassDeclaration, ClassExpression)[superClass]:not([superClass.name=/Error$/])', message: 'Do not extend classes (§8 rule 3: inheritance defeats tree-shaking). The one exception is a superclass whose name ends in `Error`, which is what lets the SDK error hierarchy extend Error (or TypeError, RangeError, ...); compose or duplicate instead of subclassing anything else.' },
  { selector: 'TSParameterProperty', message: 'Declare the field explicitly and assign it in the constructor body; ArkTS support for parameter properties is unconfirmed.' },
  { selector: 'TSCallSignatureDeclaration', message: 'ArkTS forbids call signatures in object types (arkts-no-call-signatures, 10605014). Declare a function type alias instead, e.g. `type F = (x: T) => R`.' },
  { selector: ':matches(TSConstructSignatureDeclaration, TSConstructorType)', message: 'ArkTS forbids constructor signatures in object types (arkts-no-ctor-signatures-iface 10605027, arkts-no-ctor-signatures-type 10605015). Take a factory function instead, e.g. `type Make = () => Instance`.' },
]

/** Globals that exist on one platform only. The platform-free layer names none of them. */
const platformRestrictedGlobals = [
  { name: 'fetch', message: 'The platform-free layer must not call fetch. Send the request through the injected HttpTransport (§7).' },
  { name: 'XMLHttpRequest', message: 'The platform-free layer must not drive a transport directly. Send the request through the injected HttpTransport (§7).' },
  { name: 'AbortController', message: 'ArkTS has no AbortController. Accept an AbortSignalLike parameter instead (src/utils/abort.ts).' },
  { name: 'TextEncoder', message: 'Availability on ArkTS is unconfirmed. Use src/utils/bytes.ts.' },
  { name: 'TextDecoder', message: 'Availability on ArkTS is unconfirmed. Use src/utils/bytes.ts.' },
  { name: 'btoa', message: 'Browser-only. Use src/utils/base64.ts.' },
  { name: 'atob', message: 'Browser-only. Use src/utils/base64.ts.' },
  { name: 'Blob', message: 'Browser-only. Take a StreamLike here and adapt Blob to it in the runtime layer (§7).' },
  { name: 'document', message: 'Browser-only: the platform-free layer must never touch the DOM. Keep the logic platform-free.' },
  { name: 'window', message: 'Browser-only: the platform-free layer must never touch browser globals. Anything that needs one belongs in src/runtime (§7).' },
  { name: 'process', message: 'Node-only. Environment and argv access belongs in src/runtime/node/ and arrives as configuration.' },
  { name: 'Buffer', message: 'Node-only. Use Uint8Array, which every target supports.' },
  { name: 'DOMParser', message: 'Not available on OpenHarmony (§5). Parse XML with src/xml.' },
]

const platformRestrictedImports = {
  patterns: [
    { group: ['node:*', 'fs', 'path', 'crypto', 'http', 'https', 'stream', 'url', 'buffer'], message: 'Everything outside src/runtime must reach platform capability through an injected interface (§5, §7). Put the platform import in src/runtime/node/ and inject what you need.' },
    { group: ['@ohos.*', '@kit.*'], message: 'OpenHarmony modules belong in src/runtime/harmony/ only (§3), which declares the shape it needs as an interface; take that interface as a parameter instead.' },
    { group: ['**/runtime/**', '!**/runtime/default-transport.js', '!**/runtime/client-extensions.js', '!**/runtime/mime-type.js', '!**/runtime/text-codec.js'], message: 'Only src/runtime may name a platform adapter; everything else takes an interface such as HttpTransport as a parameter and lets the caller pick the implementation.' },
  ],
}

export default tseslint.config(
  { ignores: ['dist/**', 'node_modules/**', 'coverage/**', 'samples/**', 'ohos-har/**', 'reference/**', 'docs/**'] },
  tseslint.configs.recommendedTypeChecked,
  {
    languageOptions: {
      parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname },
    },
    rules: {
      '@typescript-eslint/no-floating-promises': 'error',
      '@typescript-eslint/explicit-module-boundary-types': 'error',
      '@typescript-eslint/consistent-type-imports': 'error',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
    },
  },
  {
    files: ['src/**/*.ts'],
    rules: {
      'no-restricted-syntax': ['error', ...arktsRestrictedSyntax],
      'no-restricted-imports': ['error', platformRestrictedImports],
      'no-restricted-globals': ['error', ...platformRestrictedGlobals],
    },
  },
  {
    files: ['src/runtime/**/*.ts', 'tests/**/*.ts', 'scripts/**/*.ts', 'scripts/**/*.mjs', '*.mjs', '*.ts'],
    rules: {
      'no-restricted-syntax': 'off',
      'no-restricted-imports': 'off',
      'no-restricted-globals': 'off',
    },
  },
  {
    files: ['src/runtime/harmony/**/*.ts', 'src/runtime/default-transport.harmony.ts', 'src/runtime/client-extensions.harmony.ts', 'src/runtime/mime-type.harmony.ts', 'src/runtime/text-codec.harmony.ts'],
    rules: {
      'no-restricted-syntax': ['error', ...arktsRestrictedSyntax],
    },
  },
)

import path from 'node:path'
import process from 'node:process'
import { beforeAll, describe, expect, it } from 'vitest'
import { ESLint } from 'eslint'

const PROBE_PATH = path.join(process.cwd(), 'src', 'internal', '__lint_probe__.ts')

const eslint = new ESLint({ cwd: process.cwd() })

async function lintAsCore(code: string): Promise<string[]> {
  const results = await eslint.lintText(code, { filePath: PROBE_PATH })
  return results.flatMap((r) => r.messages.map((m) => m.message))
}

describe('ArkTS lint gate', () => {
  beforeAll(async () => {
    await lintAsCore('export const warmup = 1\n')
  }, 120_000)

  it('rejects any', async () => {
    const messages = await lintAsCore('export function f(x: any): void { void x }\n')
    expect(messages.join('\n')).toContain('ArkTS forbids `any`')
  })

  it('rejects unknown as well as any', async () => {
    const messages = await lintAsCore('export function f(x: unknown): void { void x }\n')
    expect(messages).toHaveLength(1)
    expect(messages[0]).toContain('ArkTS forbids `unknown`')
  })

  it('rejects an intersection type', async () => {
    const messages = await lintAsCore(
      'export interface A { a: number }\n' +
      'export interface B { b: number }\n' +
      'export type C = A & B\n',
    )
    expect(messages).toHaveLength(1)
    expect(messages[0]).toContain('ArkTS forbids intersection types')
  })

  it('rejects an object literal type while accepting the interface it asks for', async () => {
    const asAnnotation = await lintAsCore('export function f(x: { a: number }): number { return x.a }\n')
    expect(asAnnotation).toHaveLength(1)
    expect(asAnnotation[0]).toContain('ArkTS forbids object literal types')

    const asInterface = await lintAsCore(
      'export interface A { a: number }\n' +
      'export function f(x: A): number { return x.a }\n',
    )
    expect(asInterface).toEqual([])
  })

  it('rejects delete', async () => {
    const messages = await lintAsCore('export function f(o: Record<string, string>): void { delete o.a }\n')
    expect(messages.join('\n')).toContain('ArkTS forbids `delete`')
  })

  it('rejects for...in', async () => {
    const messages = await lintAsCore(
      'export function names(o: Record<string, string>): string[] {\n' +
      '  const out: string[] = []\n' +
      '  for (const k in o) out.push(k)\n' +
      '  return out\n' +
      '}\n',
    )
    expect(messages).toHaveLength(1)
    expect(messages[0]).toContain('ArkTS forbids `for...in`')
  })

  it('rejects node imports', async () => {
    const messages = await lintAsCore("import { createHash } from 'node:crypto'\nexport const h = createHash\n")
    expect(messages.join('\n')).toContain('reach platform capability through an injected interface')
  })

  it('rejects a platform adapter import while accepting the swapped transport specifier', async () => {
    const adapter = await lintAsCore(
      "import { createHarmonyTransport } from '../runtime/harmony/http.js'\nexport const t = createHarmonyTransport\n",
    )
    expect(adapter.join('\n')).toContain('Only src/runtime may name a platform adapter')

    const entryPoint = await lintAsCore(
      "import { createNodeTransport } from '../runtime/node/index.js'\nexport const t = createNodeTransport\n",
    )
    expect(entryPoint.join('\n')).toContain('Only src/runtime may name a platform adapter')

    const swapped = await lintAsCore(
      "import { createDefaultTransport } from '../runtime/default-transport.js'\nexport const t = createDefaultTransport\n",
    )
    expect(swapped).toEqual([])

    const variant = await lintAsCore(
      "import { createDefaultTransport } from '../runtime/default-transport.harmony.js'\nexport const t = createDefaultTransport\n",
    )
    expect(variant.join('\n')).toContain('Only src/runtime may name a platform adapter')
  })

  it('rejects class inheritance except Error subclasses', async () => {
    const bad = await lintAsCore('class A {}\nexport class B extends A {}\n')
    expect(bad.join('\n')).toContain('Do not extend classes')

    const ok = await lintAsCore("export class MyError extends Error { constructor() { super('x'); this.name = 'MyError' } }\n")
    expect(ok.join('\n')).not.toContain('Do not extend classes')
  })

  it('rejects platform-specific globals', async () => {
    const messages = await lintAsCore('export function f(): void { void new TextEncoder() }\n')
    expect(messages.join('\n')).toContain('Use src/utils/bytes.ts')
  })

  it('accepts the subset core actually uses', async () => {
    const messages = await lintAsCore(
      'export function copyInto(dst: Record<string, string>, src?: Record<string, string>): void {\n' +
      '  if (src === undefined) return\n' +
      '  for (const k of Object.keys(src)) {\n' +
      '    const v = src[k]\n' +
      '    if (v === undefined) continue\n' +
      '    dst[k] = v\n' +
      '  }\n' +
      '}\n',
    )
    expect(messages).toEqual([])
  })

  it('rejects a class expression with a superclass', async () => {
    const messages = await lintAsCore('export const B = class extends Array {}\n')
    expect(messages).toHaveLength(1)
    expect(messages[0]).toContain('Do not extend classes')

    const named = await lintAsCore('export const B = class Inner extends Array {}\n')
    expect(named).toHaveLength(1)
    expect(named[0]).toContain('Do not extend classes')
  })

  it('still accepts Error subclasses in either class form', async () => {
    expect(await lintAsCore("export const E = class extends Error { constructor() { super('x') } }\n")).toEqual([])
    expect(await lintAsCore("export class MyError extends TypeError { constructor() { super('x') } }\n")).toEqual([])
  })

  it('accepts `arguments` and `Symbol` as property names', async () => {
    const args = await lintAsCore(
      'export const o = { arguments: 1 }\n' +
      'export interface I { arguments: number }\n' +
      'export function f(x: I): number { return x.arguments }\n',
    )
    expect(args).toEqual([])

    const sym = await lintAsCore(
      'export const o = { Symbol: 1 }\n' +
      'export interface I { Symbol: number }\n' +
      'export function f(x: I): number { return x.Symbol }\n',
    )
    expect(sym).toEqual([])
  })

  it('accepts `arguments` and `Symbol` as abstract member names', async () => {
    const messages = await lintAsCore(
      'export abstract class A {\n' +
      '  abstract arguments: string\n' +
      '  abstract Symbol(): void\n' +
      '}\n',
    )
    expect(messages).toEqual([])
  })

  it('rejects object spread while accepting the array and rest-argument forms', async () => {
    const messages = await lintAsCore(
      'export function merge(a: Record<string, string>, b: Record<string, string>): Record<string, string> {\n' +
      '  return { ...a, ...b }\n' +
      '}\n',
    )
    expect(messages).toHaveLength(2)
    expect(messages[0]).toContain('ArkTS forbids object spread')

    const arrayLiteral = await lintAsCore('export function copy(xs: number[]): number[] {\n  return [...xs]\n}\n')
    expect(arrayLiteral).toEqual([])

    const restArgument = await lintAsCore('export function chars(units: number[]): string {\n  return String.fromCharCode(...units)\n}\n')
    expect(restArgument).toEqual([])
  })

  it('still rejects the arguments object and real Symbol use', async () => {
    const args = await lintAsCore('export function f(): number { return arguments.length }\n')
    expect(args).toHaveLength(1)
    expect(args[0]).toContain('ArkTS forbids the `arguments` object')

    const call = await lintAsCore('export const s = Symbol("x")\n')
    expect(call).toHaveLength(1)
    expect(call[0]).toContain('ArkTS support for Symbol is limited')

    const wellKnown = await lintAsCore('export const s: symbol = Symbol.iterator\n')
    expect(wellKnown).toHaveLength(1)
    expect(wellKnown[0]).toContain('ArkTS support for Symbol is limited')
  })

  it('rejects a constructor parameter property while accepting the explicit field', async () => {
    const messages = await lintAsCore('export class A {\n  constructor(private readonly x: number) {}\n}\n')
    expect(messages).toHaveLength(1)
    expect(messages[0]).toContain('Declare the field explicitly')

    const explicitField = await lintAsCore(
      'export class A {\n' +
      '  private readonly x: number\n' +
      '\n' +
      '  constructor(x: number) {\n' +
      '    this.x = x\n' +
      '  }\n' +
      '\n' +
      '  get(): number {\n' +
      '    return this.x\n' +
      '  }\n' +
      '}\n',
    )
    expect(explicitField).toEqual([])
  })

  it('rejects a call signature in interface and type-literal form while accepting the alternatives', async () => {
    const asInterface = await lintAsCore('export interface R { (): number }\n')
    expect(asInterface).toHaveLength(1)
    expect(asInterface[0]).toContain('ArkTS forbids call signatures in object types')

    const asTypeLiteral = await lintAsCore('export type R = { (): number }\n')
    expect(asTypeLiteral).toHaveLength(2)
    expect(asTypeLiteral.join('\n')).toContain('ArkTS forbids call signatures in object types')

    expect(await lintAsCore('export type R = () => number\n')).toEqual([])
    expect(await lintAsCore('export interface I { f(): number }\n')).toEqual([])
  })

  it('rejects both constructor-signature forms while accepting a factory type', async () => {
    const asInterface = await lintAsCore('export interface F { new (v: string): object }\n')
    expect(asInterface).toHaveLength(1)
    expect(asInterface[0]).toContain('ArkTS forbids constructor signatures in object types')

    const asTypeLiteral = await lintAsCore('export type F = { new (v: string): object }\n')
    expect(asTypeLiteral).toHaveLength(2)
    expect(asTypeLiteral.join('\n')).toContain('ArkTS forbids constructor signatures in object types')

    const asConstructorType = await lintAsCore('export type F = new (v: string) => object\n')
    expect(asConstructorType).toHaveLength(1)
    expect(asConstructorType[0]).toContain('ArkTS forbids constructor signatures in object types')

    expect(await lintAsCore('export type Make = () => object\n')).toEqual([])
  })
})

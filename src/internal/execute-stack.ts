import type { ExecuteContext } from './execute-context.js'
import { OssError } from '../error/types.js'
import type { RequestMessage, ResponseMessage } from '../transport/types.js'
import type { CreateMiddleware, ExecuteMiddleware } from './execute-middleware.js'

interface StackEntry {
  create: CreateMiddleware
  name: string
}

/** Middleware list in execution order, outermost first. Frozen after `apply()`. */
export class ExecuteStack {
  private readonly createTerminal: () => ExecuteMiddleware
  private readonly entries: StackEntry[]
  private handler?: ExecuteMiddleware

  constructor(createTerminal: () => ExecuteMiddleware) {
    this.createTerminal = createTerminal
    this.entries = []
  }

  /**
   * Appends innermost, just outside the terminal. `name` is a positioning key, not a debug label: the
   * three default names are part of the public contract.
   */
  push(create: CreateMiddleware, name: string): void {
    this.assertMutable()
    this.assertNameFree(name)
    this.entries.push({ create, name })
  }

  /** Places the new middleware *outside* `name`, so it runs first and sees the request earlier. */
  insertBefore(name: string, create: CreateMiddleware, newName: string): void {
    this.assertMutable()
    const at = this.requireIndexOf(name)
    this.assertNameFree(newName)
    this.entries.splice(at, 0, { create, name: newName })
  }

  /** Places the new middleware *inside* `name`, so it sees whatever `name` did to the request. */
  insertAfter(name: string, create: CreateMiddleware, newName: string): void {
    this.assertMutable()
    const at = this.requireIndexOf(name)
    this.assertNameFree(newName)
    this.entries.splice(at + 1, 0, { create, name: newName })
  }

  /** Swaps the factory, keeping the position and the name. */
  replace(name: string, create: CreateMiddleware): void {
    this.assertMutable()
    this.entries[this.requireIndexOf(name)] = { create, name }
  }

  /** Removes it and reports whether anything was there. */
  remove(name: string): boolean {
    this.assertMutable()
    const at = this.find(name)
    if (at < 0) return false
    this.entries.splice(at, 1)
    return true
  }

  /** Current order, outermost first. The default chain is `['Retryer', 'Signer', 'ResponseChecker']`. */
  names(): string[] {
    return this.entries.map((entry) => entry.name)
  }

  apply(): void {
    this.assertMutable()
    let next = this.createTerminal()
    for (let i = this.entries.length - 1; i >= 0; i -= 1) {
      next = this.entries[i].create(next)
    }
    this.handler = next
  }

  /** Rejects when the stack has not been applied. */
  execute(request: RequestMessage, context: ExecuteContext): Promise<ResponseMessage> {
    const handler = this.handler
    if (handler === undefined) {
      return Promise.reject(new OssError('the execute stack has not been applied'))
    }
    return handler.execute(request, context)
  }

  private assertMutable(): void {
    if (this.handler !== undefined) {
      throw new OssError('the execute stack has already been applied and cannot be modified')
    }
  }

  private assertNameFree(name: string): void {
    if (this.find(name) >= 0) {
      throw new OssError('duplicate middleware name in the execute stack: ' + name)
    }
  }

  private requireIndexOf(name: string): number {
    const at = this.find(name)
    if (at < 0) throw new OssError('no middleware named ' + name + ' in the execute stack')
    return at
  }

  private find(name: string): number {
    for (let i = 0; i < this.entries.length; i += 1) {
      if (this.entries[i].name === name) return i
    }
    return -1
  }
}

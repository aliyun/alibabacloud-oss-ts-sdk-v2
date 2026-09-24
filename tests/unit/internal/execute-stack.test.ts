import { describe, expect, it } from 'vitest'
import type { ExecuteContext } from '../../../src/internal/execute-context.js'
import { ExecuteStack } from '../../../src/internal/execute-stack.js'
import type { CreateMiddleware, ExecuteMiddleware } from '../../../src/internal/execute-middleware.js'
import type { RequestMessage, ResponseMessage } from '../../../src/transport/types.js'
import { executeContext } from '../../fixtures/execute-context.js'
import { createHeaderFields } from '../../../src/utils/header-fields.js'

const request: RequestMessage = { method: 'GET', url: 'https://example.com/', headers: createHeaderFields() }
const okResponse: ResponseMessage = { status: 'OK', statusCode: 200, headers: {} }

/** Records entry and exit so the assertions can see the nesting, not just the order. */
function recorder(label: string, log: string[]): CreateMiddleware {
  return (next: ExecuteMiddleware): ExecuteMiddleware => ({
    execute: async (req: RequestMessage, ctx: ExecuteContext): Promise<ResponseMessage> => {
      log.push('>' + label)
      const response = await next.execute(req, ctx)
      log.push('<' + label)
      return response
    },
  })
}

interface Seen {
  request: RequestMessage
  context: ExecuteContext
}

function terminalFactory(log: string[], counter?: { built: number }, seen?: Seen[]): () => ExecuteMiddleware {
  return () => {
    if (counter !== undefined) counter.built += 1
    return {
      execute: (req: RequestMessage, ctx: ExecuteContext): Promise<ResponseMessage> => {
        log.push('T')
        if (seen !== undefined) seen.push({ request: req, context: ctx })
        return Promise.resolve(okResponse)
      },
    }
  }
}

describe('ExecuteStack', () => {
  it('runs pushed middlewares outermost-first and folds the terminal innermost', async () => {
    const log: string[] = []
    const stack = new ExecuteStack(terminalFactory(log))
    stack.push(recorder('A', log), 'A')
    stack.push(recorder('B', log), 'B')
    stack.apply()

    const response = await stack.execute(request, executeContext())
    expect(response.statusCode).toBe(200)
    expect(log).toEqual(['>A', '>B', 'T', '<B', '<A'])
  })

  // Identity: a copied request drops a field (→ SignatureDoesNotMatch) and a copied context breaks
  // the mutation contract, stranding the signer's `signTime` and retryer's `clockOffset`.
  it("hands the innermost handler the caller's own request and context", async () => {
    const seen: Seen[] = []
    const stack = new ExecuteStack(terminalFactory([], undefined, seen))
    stack.push(recorder('A', []), 'A')
    stack.apply()

    const context = executeContext()
    await stack.execute(request, context)
    expect(seen.length).toBe(1)
    expect(seen[0].request).toBe(request)
    expect(seen[0].context).toBe(context)
  })

  // `apply()` folds once and `execute()` reuses it, so factories never rerun and constructor-built state survives.
  it('builds the terminal exactly once, at apply time, and never again per request', async () => {
    const counter = { built: 0 }
    const stack = new ExecuteStack(terminalFactory([], counter))
    expect(counter.built).toBe(0)
    stack.apply()
    expect(counter.built).toBe(1)

    await stack.execute(request, executeContext())
    await stack.execute(request, executeContext())
    expect(counter.built).toBe(1)
  })

  // Runs the chain, not just `names()`: `names()` cannot tell a stored factory from a pass-through.
  it('inserts outside the named middleware with insertBefore', async () => {
    const log: string[] = []
    const stack = new ExecuteStack(terminalFactory(log))
    stack.push(recorder('Retryer', log), 'Retryer')
    stack.push(recorder('Signer', log), 'Signer')
    stack.insertBefore('Signer', recorder('X', log), 'X')
    expect(stack.names()).toEqual(['Retryer', 'X', 'Signer'])
    stack.apply()
    await stack.execute(request, executeContext())
    expect(log).toEqual(['>Retryer', '>X', '>Signer', 'T', '<Signer', '<X', '<Retryer'])
  })

  it('inserts inside the named middleware with insertAfter', async () => {
    const log: string[] = []
    const stack = new ExecuteStack(terminalFactory(log))
    stack.push(recorder('Retryer', log), 'Retryer')
    stack.push(recorder('Signer', log), 'Signer')
    stack.insertAfter('Signer', recorder('X', log), 'X')
    expect(stack.names()).toEqual(['Retryer', 'Signer', 'X'])
    stack.apply()
    await stack.execute(request, executeContext())
    expect(log).toEqual(['>Retryer', '>Signer', '>X', 'T', '<X', '<Signer', '<Retryer'])
  })

  // `names()` cannot bind `replace` (a no-op keeps position and name too), so the run proves the swap.
  it('replaces in place and removes by name', async () => {
    const log: string[] = []
    const stack = new ExecuteStack(terminalFactory(log))
    stack.push(recorder('A', log), 'A')
    stack.push(recorder('B', log), 'B')
    stack.replace('A', recorder('A2', log))
    expect(stack.names()).toEqual(['A', 'B'])
    expect(stack.remove('B')).toBe(true)
    expect(stack.remove('B')).toBe(false)
    expect(stack.names()).toEqual(['A'])

    stack.apply()
    await stack.execute(request, executeContext())
    expect(log).toEqual(['>A2', 'T', '<A2'])
  })

  // The guard is copy-pasted into five methods, so every one is exercised to catch a missing paste.
  it('rejects a duplicate name from every method that introduces one', () => {
    const stack = new ExecuteStack(terminalFactory([]))
    stack.push(recorder('A', []), 'A')
    expect(() => stack.push(recorder('A', []), 'A')).toThrow(/duplicate middleware name/)
    expect(() => stack.insertBefore('A', recorder('A', []), 'A')).toThrow(/duplicate middleware name/)
    expect(() => stack.insertAfter('A', recorder('A', []), 'A')).toThrow(/duplicate middleware name/)
    expect(stack.names()).toEqual(['A'])
  })

  it('rejects positioning against a name that is not in the stack', () => {
    const stack = new ExecuteStack(terminalFactory([]))
    expect(() => stack.insertBefore('Nope', recorder('X', []), 'X')).toThrow(/no middleware named Nope/)
    expect(() => stack.insertAfter('Nope', recorder('X', []), 'X')).toThrow(/no middleware named Nope/)
    expect(() => stack.replace('Nope', recorder('X', []))).toThrow(/no middleware named Nope/)
    // The anchor is reported even when the new name is also a duplicate.
    stack.push(recorder('A', []), 'A')
    expect(() => stack.insertBefore('Nope', recorder('A', []), 'A')).toThrow(/no middleware named Nope/)
  })

  it('freezes every mutator after apply', () => {
    const stack = new ExecuteStack(terminalFactory([]))
    stack.push(recorder('A', []), 'A')
    stack.apply()
    expect(() => stack.push(recorder('B', []), 'B')).toThrow(/already been applied/)
    expect(() => stack.insertBefore('A', recorder('B', []), 'B')).toThrow(/already been applied/)
    expect(() => stack.insertAfter('A', recorder('B', []), 'B')).toThrow(/already been applied/)
    expect(() => stack.replace('A', recorder('B', []))).toThrow(/already been applied/)
    expect(() => stack.remove('A')).toThrow(/already been applied/)
    expect(() => stack.apply()).toThrow(/already been applied/)
    expect(stack.names()).toEqual(['A'])
  })

  it('refuses to execute before apply', async () => {
    const stack = new ExecuteStack(terminalFactory([]))
    await expect(stack.execute(request, executeContext())).rejects.toThrow(/has not been applied/)
  })
})

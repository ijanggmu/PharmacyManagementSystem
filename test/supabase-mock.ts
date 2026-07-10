/**
 * Minimal fake of the Supabase JS query builder for unit-testing service
 * functions in lib/server/services/*. Real supabase-js builders are
 * "thenable" (awaitable at any point in the chain, e.g.
 * `await supabase.from(t).select().eq().single()`), so this mock records
 * every chained call and only resolves when awaited, via a per-table
 * handler that inspects the recorded calls and returns { data, error }.
 */

export interface RecordedCall {
  method: string
  args: unknown[]
}

export type TableHandler = (calls: RecordedCall[]) => { data: unknown; error: unknown } | Promise<{ data: unknown; error: unknown }>

const CHAIN_METHODS = [
  "select",
  "insert",
  "update",
  "upsert",
  "delete",
  "eq",
  "neq",
  "in",
  "or",
  "ilike",
  "order",
  "limit",
  "range",
  "single",
  "maybeSingle",
  "filter",
  "gt",
  "gte",
  "lt",
  "lte",
  "not",
]

function makeBuilder(table: string, handler: TableHandler | undefined, log: RecordedCall[][]) {
  const calls: RecordedCall[] = []
  log.push(calls)

  const builder: Record<string, unknown> = {}
  for (const method of CHAIN_METHODS) {
    builder[method] = (...args: unknown[]) => {
      calls.push({ method, args })
      return builder
    }
  }

  const resolve = () => {
    if (!handler) {
      return Promise.resolve({ data: null, error: new Error(`No mock handler registered for table "${table}"`) })
    }
    return Promise.resolve(handler(calls))
  }

  builder.then = (onFulfilled: any, onRejected: any) => resolve().then(onFulfilled, onRejected)
  builder.catch = (onRejected: any) => resolve().catch(onRejected)

  return builder
}

/**
 * Creates a fake SupabaseClient. `handlers` maps table name -> function
 * receiving the recorded chain calls for that `.from(table)` invocation,
 * returning `{ data, error }`. `calls` (if passed) collects every chain's
 * call log per table, useful for asserting what payload was inserted.
 */
export function createMockSupabase(
  handlers: Record<string, TableHandler>,
  calls: Record<string, RecordedCall[][]> = {}
) {
  const client = {
    from(table: string) {
      const log = (calls[table] ??= [])
      return makeBuilder(table, handlers[table], log)
    },
  }
  return client as any
}

/** Convenience: find the args passed to `method` in the most recent call log for a table. */
export function lastCallArgs(calls: RecordedCall[][], method: string): unknown[] | undefined {
  const lastLog = calls[calls.length - 1]
  return lastLog?.find((c) => c.method === method)?.args
}

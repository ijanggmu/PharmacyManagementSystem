/**
 * Server-side store for .NET access/refresh tokens, keyed by an opaque session id.
 *
 * Why this exists: the .NET access token is a JWT whose size grows with the caller's permission
 * claims. A root Admin's token can exceed the ~4096-byte limit browsers enforce per cookie, which
 * causes the cookie to be silently dropped (login still returns 200, but every later request is
 * unauthenticated). The fix is to never put the raw JWT in a cookie: tokens live here, in memory,
 * and the browser only ever holds a short random id (see SESSION_ID_COOKIE in dotnet-session.ts).
 *
 * Process-local by design: this is a `globalThis`-backed singleton `Map` (see below for why it
 * isn't just a plain module-level variable), so it lives for as long as the Node process hosting
 * this Next.js server instance runs.
 *   - It resets whenever the dev/prod server process restarts (expected, not a bug).
 *   - It does NOT work across multiple server instances (e.g. several Next.js processes behind a
 *     load balancer, or serverless/edge instances that don't share memory) — each instance would
 *     have its own Map, so a session created on one instance would not be visible on another.
 *     A real multi-instance deployment needs a shared store (e.g. Redis) instead. That is a known
 *     follow-up, not implemented here.
 */

import type { TokenPair } from "@/lib/api/dotnet-session"

export type { TokenPair }

// Next.js (Turbopack, and webpack before it) compiles proxy/middleware, Route Handlers and
// Server Components as SEPARATE bundles, each with its own module registry — so a plain
// module-level `Map` here would be instantiated once per bundle, even within the same OS
// process, and a session created in one (e.g. the login route) would be invisible in another
// (e.g. the proxy). `globalThis` is the one object every bundle's module graph shares within a
// process, so the store is attached there instead — the same pattern Prisma recommends for a
// singleton client under Next.js, for the same underlying reason.
const GLOBAL_KEY = Symbol.for("fsh.dotnet-token-store")
type GlobalWithStore = typeof globalThis & { [GLOBAL_KEY]?: Map<string, TokenPair> }
const g = globalThis as GlobalWithStore
const store = g[GLOBAL_KEY] ?? (g[GLOBAL_KEY] = new Map<string, TokenPair>())

/** Creates a new session for a token pair and returns its opaque id. */
export function createSession(tokens: TokenPair): string {
  const id = crypto.randomUUID()
  store.set(id, tokens)
  return id
}

/** Returns the token pair for a session id, or null when it does not exist (e.g. after a server restart). */
export function getSession(id: string | null | undefined): TokenPair | null {
  if (!id) return null
  const found = store.get(id) ?? null
  return found
}

/** Replaces the token pair for an existing session id (e.g. after a token refresh). */
export function updateSession(id: string, tokens: TokenPair): void {
  store.set(id, tokens)
}

/** Removes a session's token pair (e.g. on logout). Safe to call with an id that is not present. */
export function deleteSession(id: string | null | undefined): void {
  if (!id) return
  store.delete(id)
}

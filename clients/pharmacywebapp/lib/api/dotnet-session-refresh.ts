/**
 * One place that turns a session id into a usable access token, refreshing it when it is near expiry.
 * Used by the BFF proxy, the proxy.ts session guard, Server Components and the explicit refresh route.
 *
 * Why single-flight: a page load fires the proxy.ts guard, a Server Component and several BFF calls at
 * once. Before, each one saw the near-expiry token and called the API's refresh endpoint with the SAME
 * refresh token. The API rotates the token on the first call, so every other call was rejected — and the
 * losers cleared the session cookie, logging the user out at random. Now:
 *   - concurrent refreshes of one session in this process share a single in-flight promise;
 *   - before refreshing, the store is re-read (another instance may have rotated already);
 *   - when a refresh is rejected but the store now holds a DIFFERENT refresh token (someone else won
 *     the race), that newer pair is used instead of ending the session;
 *   - a transient API failure (5xx/429/network) never ends the session;
 *   - the store is written with compare-and-set on the refresh token we refreshed FROM, so a refresh that
 *     finishes after a logout cannot resurrect the session, and an expired session is deleted only while
 *     it still holds the rejected token (another instance may have refreshed it in the meantime).
 * Refresh always uses the tenant of the session's own token, never a per-call override.
 */

import {
  RefreshUnavailableError,
  appForAccessToken,
  needsRefresh,
  refreshTokens,
  tenantFromAccessToken,
  type TokenPair,
} from "@/lib/api/dotnet-session"
import { deleteSessionIfUnchanged, getSession, updateSession } from "@/lib/api/dotnet-token-store"

export type SessionResolution =
  | { status: "ok"; tokens: TokenPair }
  /** No session for this id (signed out, expired entry, unknown id). */
  | { status: "missing" }
  /**
   * The refresh token was rejected: the session is over and the cookie should be cleared. The store entry
   * has already been removed (conditionally) here — callers clear only the cookie.
   */
  | { status: "expired" }
  /** Refresh could not be performed right now (API down / rate limited). Keep the session. */
  | { status: "unavailable" }

export interface ResolveOptions {
  baseUrl: string | null
  /** Used only when the stored token carries no tenant claim (should not happen for .NET tokens). */
  fallbackTenant: string
  clientIp?: string | null
  fetchImpl?: typeof fetch
}

const INFLIGHT_KEY = Symbol.for("fsh.dotnet-session-refresh.inflight")
type GlobalWithInflight = typeof globalThis & { [INFLIGHT_KEY]?: Map<string, Promise<SessionResolution>> }
const g = globalThis as GlobalWithInflight
const inflight = g[INFLIGHT_KEY] ?? (g[INFLIGHT_KEY] = new Map<string, Promise<SessionResolution>>())

/**
 * Ends a session whose refresh token was rejected — but only if the store still holds THAT token. When
 * another instance refreshed in the meantime the newer pair is returned instead of logging the user out.
 */
async function expire(sid: string, rejectedRefreshToken: string): Promise<SessionResolution> {
  if (await deleteSessionIfUnchanged(sid, rejectedRefreshToken)) return { status: "expired" }
  const current = await getSession(sid)
  if (current && current.refreshToken !== rejectedRefreshToken) return { status: "ok", tokens: current }
  return current ? { status: "expired" } : { status: "missing" }
}

async function refreshOnce(sid: string, stale: TokenPair, options: ResolveOptions): Promise<SessionResolution> {
  // Another request/instance may have rotated while we waited — use its result.
  const latest = await getSession(sid)
  if (!latest) return { status: "missing" }
  if (latest.refreshToken !== stale.refreshToken && !needsRefresh(latest.accessToken)) {
    return { status: "ok", tokens: latest }
  }
  if (!options.baseUrl || !latest.refreshToken) return expire(sid, latest.refreshToken)

  let rotated: TokenPair | null
  try {
    rotated = await refreshTokens(
      {
        baseUrl: options.baseUrl,
        tenant: tenantFromAccessToken(latest.accessToken) ?? options.fallbackTenant,
        app: appForAccessToken(latest.accessToken),
        clientIp: options.clientIp,
        fetchImpl: options.fetchImpl,
      },
      { accessToken: latest.accessToken ?? "", refreshToken: latest.refreshToken },
    )
  } catch (error) {
    if (error instanceof RefreshUnavailableError) return { status: "unavailable" }
    throw error
  }

  if (rotated) {
    // Compare-and-set on the token we refreshed from: never recreates a session that was signed out while
    // the refresh was in flight, and never overwrites a newer pair another instance stored.
    if (await updateSession(sid, rotated, latest.refreshToken)) return { status: "ok", tokens: rotated }
    const current = await getSession(sid)
    return current ? { status: "ok", tokens: current } : { status: "missing" }
  }

  // Rejected. If a concurrent refresh (e.g. on another instance) already stored a newer pair, our token
  // was simply the stale one — keep the session with the winner's tokens.
  const after = await getSession(sid)
  if (!after) return { status: "missing" }
  if (after.refreshToken !== latest.refreshToken) return { status: "ok", tokens: after }
  return expire(sid, latest.refreshToken)
}

/**
 * Returns the session's tokens, refreshed if the access token is (nearly) expired. Concurrent calls for
 * the same session id share one refresh.
 */
export async function resolveSessionTokens(sid: string | null | undefined, options: ResolveOptions): Promise<SessionResolution> {
  if (!sid) return { status: "missing" }
  const session = await getSession(sid)
  if (!session) return { status: "missing" }
  if (session.accessToken && !needsRefresh(session.accessToken)) return { status: "ok", tokens: session }
  if (!session.refreshToken) return expire(sid, session.refreshToken)

  const pending = inflight.get(sid)
  if (pending) return pending

  const run = refreshOnce(sid, session, options).finally(() => {
    inflight.delete(sid)
  })
  inflight.set(sid, run)
  return run
}

/** Forces a refresh even when the access token is still valid (explicit /auth/refresh). Single-flight too. */
export async function forceRefreshSession(sid: string | null | undefined, options: ResolveOptions): Promise<SessionResolution> {
  if (!sid) return { status: "missing" }
  const session = await getSession(sid)
  if (!session) return { status: "missing" }
  if (!session.refreshToken) return expire(sid, session.refreshToken)

  const pending = inflight.get(sid)
  if (pending) return pending

  // refreshOnce only short-circuits when the store moved past this snapshot, so a still-valid access
  // token is refreshed here as requested.
  const run = refreshOnce(sid, session, options).finally(() => {
    inflight.delete(sid)
  })
  inflight.set(sid, run)
  return run
}

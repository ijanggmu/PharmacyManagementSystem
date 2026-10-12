/**
 * Server-side store for .NET access/refresh tokens, keyed by an opaque session id.
 *
 * Why this exists: the .NET access token is a JWT whose size grows with the caller's permission
 * claims. A root Admin's token can exceed the ~4096-byte limit browsers enforce per cookie, which
 * causes the cookie to be silently dropped (login still returns 200, but every later request is
 * unauthenticated). The fix is to never put the raw JWT in a cookie: tokens live here, and the
 * browser only ever holds a short random id (see SESSION_ID_COOKIE in dotnet-session.ts).
 *
 * Backends:
 *   - Redis (production): used when REDIS_URL is set. Sessions survive a redeploy/restart and are
 *     shared by every Next.js instance. Each entry expires with its refresh token.
 *   - In-memory (dev/test fallback): a `globalThis`-backed Map (see below for why), with the same
 *     expiry semantics enforced on read plus a periodic purge, so abandoned sessions don't pile up.
 *     It is process-local: sessions are lost on restart and not shared between instances.
 */

import type { TokenPair } from "@/lib/api/dotnet-session"

export type { TokenPair }

const KEY_PREFIX = "fsh:bff:sid:"
/** Floor for an entry's TTL, so a token pair that is already (nearly) expired still round-trips once. */
const MIN_TTL_SECONDS = 60
const PURGE_INTERVAL_MS = 10 * 60 * 1000

interface SerializedTokens {
  accessToken: string
  refreshToken: string
  refreshTokenExpiresAt: string
}

/** Minimal async key-value contract both backends satisfy (and tests can fake). */
export interface SessionBackend {
  get(key: string): Promise<string | null>
  set(key: string, value: string, ttlSeconds: number): Promise<void>
  del(key: string): Promise<void>
  /**
   * Atomically replaces the value only while the stored entry exists AND its refresh token equals
   * `expectedRefreshToken` (Redis: a Lua compare-and-set). Never creates a missing key, so a session deleted
   * by logout/expiry cannot be resurrected by a refresh that finishes afterwards. Returns whether it wrote.
   */
  compareAndSet(key: string, expectedRefreshToken: string, value: string, ttlSeconds: number): Promise<boolean>
  /** Atomically deletes the entry only while its refresh token equals `expectedRefreshToken`. */
  compareAndDelete(key: string, expectedRefreshToken: string): Promise<boolean>
}

function storedRefreshToken(raw: string | null): string | null {
  if (!raw) return null
  try {
    const value = JSON.parse(raw) as { refreshToken?: unknown }
    return typeof value.refreshToken === "string" ? value.refreshToken : null
  } catch {
    return null
  }
}

// Next.js (Turbopack, and webpack before it) compiles proxy/middleware, Route Handlers and
// Server Components as SEPARATE bundles, each with its own module registry — so a plain
// module-level singleton here would be instantiated once per bundle, even within the same OS
// process, and a session created in one (e.g. the login route) would be invisible in another
// (e.g. the proxy). `globalThis` is the one object every bundle's module graph shares within a
// process, so the backend is attached there instead — the same pattern Prisma recommends for a
// singleton client under Next.js, for the same underlying reason.
const GLOBAL_KEY = Symbol.for("fsh.dotnet-token-store.backend")
const PENDING_KEY = Symbol.for("fsh.dotnet-token-store.pending")
type GlobalWithBackend = typeof globalThis & {
  [GLOBAL_KEY]?: SessionBackend
  [PENDING_KEY]?: Promise<SessionBackend>
}
const g = globalThis as GlobalWithBackend

/** Process-local backend with TTL: expired entries are dropped on read and by a periodic sweep. */
export function createMemoryBackend(now: () => number = Date.now): SessionBackend & { size(): number; purge(): void } {
  const map = new Map<string, { value: string; expiresAt: number }>()
  const purge = () => {
    const t = now()
    for (const [key, entry] of map) if (entry.expiresAt <= t) map.delete(key)
  }
  if (typeof setInterval === "function") {
    const timer = setInterval(purge, PURGE_INTERVAL_MS)
    ;(timer as { unref?: () => void }).unref?.()
  }
  return {
    async get(key) {
      const entry = map.get(key)
      if (!entry) return null
      if (entry.expiresAt <= now()) {
        map.delete(key)
        return null
      }
      return entry.value
    },
    async set(key, value, ttlSeconds) {
      map.set(key, { value, expiresAt: now() + ttlSeconds * 1000 })
    },
    async del(key) {
      map.delete(key)
    },
    // Single-threaded JS: read-check-write with no await in between is atomic.
    async compareAndSet(key, expectedRefreshToken, value, ttlSeconds) {
      const entry = map.get(key)
      if (!entry || entry.expiresAt <= now() || storedRefreshToken(entry.value) !== expectedRefreshToken) return false
      map.set(key, { value, expiresAt: now() + ttlSeconds * 1000 })
      return true
    },
    async compareAndDelete(key, expectedRefreshToken) {
      const entry = map.get(key)
      if (!entry || storedRefreshToken(entry.value) !== expectedRefreshToken) return false
      map.delete(key)
      return true
    },
    size: () => map.size,
    purge,
  }
}

// KEYS[1] = session key, ARGV[1] = expected refresh token, ARGV[2] = new value, ARGV[3] = ttl seconds.
// cjson.decode runs inside Redis, so the check and the write are one atomic step.
const COMPARE_AND_SET_LUA = `
local current = redis.call('GET', KEYS[1])
if not current then return 0 end
local ok, decoded = pcall(cjson.decode, current)
if not ok or type(decoded) ~= 'table' or decoded['refreshToken'] ~= ARGV[1] then return 0 end
redis.call('SET', KEYS[1], ARGV[2], 'EX', tonumber(ARGV[3]))
return 1
`

const COMPARE_AND_DELETE_LUA = `
local current = redis.call('GET', KEYS[1])
if not current then return 0 end
local ok, decoded = pcall(cjson.decode, current)
if not ok or type(decoded) ~= 'table' or decoded['refreshToken'] ~= ARGV[1] then return 0 end
redis.call('DEL', KEYS[1])
return 1
`

/** Redis backend (ioredis). Loaded lazily so the dev/test path never needs a Redis server. */
async function createRedisBackend(url: string): Promise<SessionBackend> {
  const { default: Redis } = await import("ioredis")
  const client = new Redis(url, { maxRetriesPerRequest: 2 })
  client.on("error", (error: Error) => {
    // Never log the URL (it carries the password).
    console.error("[dotnet-token-store] redis error:", error.message)
  })
  return {
    async get(key) {
      return client.get(key)
    },
    async set(key, value, ttlSeconds) {
      await client.set(key, value, "EX", ttlSeconds)
    },
    async del(key) {
      await client.del(key)
    },
    async compareAndSet(key, expectedRefreshToken, value, ttlSeconds) {
      const result = await client.eval(COMPARE_AND_SET_LUA, 1, key, expectedRefreshToken, value, String(ttlSeconds))
      return result === 1
    },
    async compareAndDelete(key, expectedRefreshToken) {
      const result = await client.eval(COMPARE_AND_DELETE_LUA, 1, key, expectedRefreshToken)
      return result === 1
    },
  }
}

function backend(): Promise<SessionBackend> {
  const existing = g[GLOBAL_KEY]
  if (existing) return Promise.resolve(existing)
  if (!g[PENDING_KEY]) {
    const url = process.env.REDIS_URL?.trim()
    g[PENDING_KEY] = (url ? createRedisBackend(url) : Promise.resolve(createMemoryBackend())).then((created) => {
      g[GLOBAL_KEY] = g[GLOBAL_KEY] ?? created
      return g[GLOBAL_KEY]
    })
  }
  return g[PENDING_KEY]
}

/** Test hook: swap the backend (e.g. a fresh memory backend per test). */
export function setSessionBackendForTests(next: SessionBackend | null): void {
  g[GLOBAL_KEY] = next ?? undefined
  g[PENDING_KEY] = undefined
}

function ttlSecondsFor(tokens: TokenPair): number {
  const ms = new Date(tokens.refreshTokenExpiresAt).getTime() - Date.now()
  return Number.isFinite(ms) ? Math.max(MIN_TTL_SECONDS, Math.ceil(ms / 1000)) : MIN_TTL_SECONDS
}

function serialize(tokens: TokenPair): string {
  const expires = new Date(tokens.refreshTokenExpiresAt)
  const value: SerializedTokens = {
    accessToken: tokens.accessToken,
    refreshToken: tokens.refreshToken,
    refreshTokenExpiresAt: Number.isFinite(expires.getTime()) ? expires.toISOString() : new Date(0).toISOString(),
  }
  return JSON.stringify(value)
}

function deserialize(raw: string | null): TokenPair | null {
  if (!raw) return null
  try {
    const value = JSON.parse(raw) as Partial<SerializedTokens>
    if (typeof value.accessToken !== "string" || typeof value.refreshToken !== "string") return null
    return {
      accessToken: value.accessToken,
      refreshToken: value.refreshToken,
      refreshTokenExpiresAt: new Date(value.refreshTokenExpiresAt ?? 0),
    }
  } catch {
    return null
  }
}

/** Session ids are random UUIDs; anything else (a tampered cookie) is never looked up. */
const SESSION_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** Creates a new session for a token pair and returns its opaque id. */
export async function createSession(tokens: TokenPair): Promise<string> {
  const id = crypto.randomUUID()
  await (await backend()).set(KEY_PREFIX + id, serialize(tokens), ttlSecondsFor(tokens))
  return id
}

/** Returns the token pair for a session id, or null when it does not exist or has expired. */
export async function getSession(id: string | null | undefined): Promise<TokenPair | null> {
  if (!id || !SESSION_ID_PATTERN.test(id)) return null
  return deserialize(await (await backend()).get(KEY_PREFIX + id))
}

/**
 * Replaces the token pair of an EXISTING session whose stored refresh token is still `expectedRefreshToken`
 * (the pair this caller refreshed from). Returns false — and writes nothing — when the session was deleted
 * meanwhile (logout / expiry on another request or instance) or another refresh already replaced it, so a
 * late refresh can neither resurrect a signed-out session nor overwrite a newer pair.
 */
export async function updateSession(id: string, tokens: TokenPair, expectedRefreshToken: string): Promise<boolean> {
  if (!SESSION_ID_PATTERN.test(id)) return false
  return (await backend()).compareAndSet(KEY_PREFIX + id, expectedRefreshToken, serialize(tokens), ttlSecondsFor(tokens))
}

/**
 * Removes a session only while it still holds `expectedRefreshToken` — used when a refresh was rejected, so a
 * session another instance refreshed in the meantime is kept. Returns whether it deleted.
 */
export async function deleteSessionIfUnchanged(id: string | null | undefined, expectedRefreshToken: string): Promise<boolean> {
  if (!id || !SESSION_ID_PATTERN.test(id)) return false
  return (await backend()).compareAndDelete(KEY_PREFIX + id, expectedRefreshToken)
}

/** Removes a session's token pair (e.g. on logout). Safe to call with an id that is not present. */
export async function deleteSession(id: string | null | undefined): Promise<void> {
  if (!id || !SESSION_ID_PATTERN.test(id)) return
  await (await backend()).del(KEY_PREFIX + id)
}

/**
 * Resolve tenant pharmacy code from request host when using tenant subdomains.
 *
 * Configure production with:
 *   NEXT_PUBLIC_TENANT_ROOT_DOMAIN=yourdomain.com
 *
 * Examples (root = "yourdomain.com"):
 *   acme.yourdomain.com     → acme
 *   www.yourdomain.com      → null (apex/www)
 *   yourdomain.com          → null
 *
 * For local dev, you can use e.g. acme.localhost (root = "localhost").
 */

export function getTenantCodeFromHost(hostHeader: string | null, rootDomain: string | null): string | null {
  if (!hostHeader || !rootDomain?.trim()) return null

  const host = hostHeader.split(":")[0]?.toLowerCase() ?? ""
  const root = rootDomain.trim().toLowerCase().split(":")[0] ?? ""

  if (!host || !root) return null

  if (host === root || host === `www.${root}`) return null

  const suffix = `.${root}`
  if (!host.endsWith(suffix)) return null

  const sub = host.slice(0, -suffix.length)
  if (!sub || sub.includes(".")) return null

  return sub
}

export function getTenantRootDomainFromEnv(): string | null {
  const raw = process.env.NEXT_PUBLIC_TENANT_ROOT_DOMAIN || process.env.TENANT_ROOT_DOMAIN
  return raw?.trim() ? raw.trim() : null
}

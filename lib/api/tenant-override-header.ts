/**
 * Shared constant for the browser<->BFF tenant-override header (see lib/api/dotnet-bff.ts for the
 * full explanation). Kept in its own module with no server-only imports so browser-side API clients
 * (e.g. features/tenants/users-api-client.ts) can import it without pulling in next/server.
 */
export const TENANT_OVERRIDE_HEADER = "x-target-tenant"

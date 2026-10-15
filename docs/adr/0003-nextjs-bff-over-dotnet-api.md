# 0003. Next.js web app as a BFF over the .NET API

- **Status:** Accepted (migration completed; Supabase removed)
- **Date:** 2026-09-09 (decided in `clients/pharmacywebapp/docs/dotnet-migration-plan.md` §1 and §7). The current
  session design (Redis token store) is from 2026-10-11.

## Context

The pharmacy-staff app (`clients/pharmacywebapp`) was a Next.js app talking to Supabase (Auth, Postgres, RLS)
through its own Route Handlers and services. The backend moved to the .NET API (ADR 0001). The options were to
have the browser call the .NET API directly with a bearer token, or to keep Next.js in between.

Concerns: keeping tokens away from browser JavaScript (XSS posture), avoiding CORS-plus-cookie complexity,
tenant resolution from subdomains, and rate limiting by real client IP. Access tokens with large permission
sets can also exceed the roughly 4 KB cookie limit.

## Decision

Next.js is a **thin Backend-for-Frontend** with no business logic or persistence:

- The browser calls only same-origin `/api/dotnet/*` (`lib/api/dotnet-client.ts`). The catch-all proxy
  `app/api/dotnet/[...path]` checks CSRF, resolves the session, refreshes the access token if it is near
  expiry, and forwards the request to `DOTNET_API_URL` with `Authorization`, `tenant`, the app header,
  `X-Forwarded-For`, `Idempotency-Key` and `X-Branch-Id`. It streams the response back unchanged.
- Sessions: the browser holds only an opaque `fsh_sid` httpOnly cookie. Tokens are in a server-side store
  (`lib/api/dotnet-token-store.ts`): Redis in production (`REDIS_URL`, logical DB 1), in-memory in dev. Refresh
  is single-flight with compare-and-set rotation.
- Permissions come from the token's `permission` claims, mapped to the UI's legacy names in
  `lib/api/dotnet-permissions.ts` (fail closed). The API remains the enforcement point.
- In production the API is reached over the compose network (`http://fsh-api:8080`). Pharmacy users never need a
  public API.
- The admin console (`clients/admin`, React/Vite) is separate and calls the API directly. It is out of scope here.

Rules for working in the app: `clients/pharmacywebapp/rule.md`.

## Consequences

- **+** No bearer token in the browser. CSRF (double-submit token + Origin check) protects every mutation.
- **+** One place for session refresh, tenant/branch headers and client-IP forwarding.
- **+** Redis-backed sessions survive redeploys and can be shared by replicas.
- **−** An extra hop and an extra moving part. The web app depends on Redis for sessions, so losing Redis signs
  everyone out but loses no data.
- **−** The UI maps .NET DTOs to legacy UI shapes (`lib/api/*-api.ts`), which is extra code to maintain.
- **−** Every new backend capability needs a .NET endpoint first. The BFF must not grow logic of its own.

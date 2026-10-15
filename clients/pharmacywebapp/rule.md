# PharmaCare web app (Next.js BFF over the .NET API): engineering rules

You are a senior fullstack engineer working on the pharmacy-staff web app. This app does **not** own data or
business rules. It is a **Backend-for-Frontend (BFF)** in front of the .NET API at the repo root
(`src/`, see `/AGENTS.md`). The API owns persistence, validation, tenancy, permissions and accounting.

Stack: **Next.js 16 App Router** (`proxy.ts` convention), **React 19**, **TypeScript (strict)**,
**TanStack Query v5**, **shadcn/ui (Radix + Tailwind v4)**, **zod**, **Vitest** and **Playwright**. Package manager: **Yarn 4**.

---

## 1. Goals (in order)

1. **Correctness.** The server enforces authz, tenancy and money/stock integrity. The UI never relies on
   hiding things as its only protection.
2. **Maintainability.** Each business rule has one owner, and that owner is the .NET API. The web app maps
   DTOs and renders them.
3. **Security.** The browser never holds a bearer token. Every mutation is CSRF-checked.
4. **UX.** Loading, empty and error states. Works for Nepali users (BS dates, Nepali language and digits)
   and on a flaky connection (offline POS queue).

---

## 2. Architecture at a glance

```
Browser ──fetch──▶ /api/dotnet/[...path]  (Next Route Handler, same origin)
                    │  requireCSRF on mutations
                    │  fsh_sid cookie ─▶ token store (Redis / in-memory) ─▶ access token (refreshed if near expiry)
                    │  adds Authorization, tenant, X-FSH-App, X-Forwarded-For, Idempotency-Key, X-Branch-Id
                    ▼
               .NET API  (DOTNET_API_URL, e.g. http://fsh-api:8080)  /api/v1/...
```

| Piece | Where | What it does |
|---|---|---|
| Browser client | `lib/api/dotnet-client.ts` | `dotnetClient.get/post/put/patch/delete`. Calls `/api/dotnet/*` with `credentials: "same-origin"`. On mutations it fetches a CSRF token from `/api/csrf/token` and sends `X-CSRF-Token`. Takes an optional `Idempotency-Key`. Has a 15 s timeout. Throws `DotnetApiError` (ProblemDetails normalized by `dotnet-problem.ts`). Paths may be written with or without `/api/v1`. |
| Catch-all proxy | `app/api/dotnet/[...path]/route.ts` | CSRF check, then session lookup and refresh, then streams the upstream response back unchanged (binary safe, so PDFs and exports work). |
| Auth BFF routes | `app/api/dotnet/auth/*` (login, logout, refresh, session, register, forgot/reset password, google), `app/api/dotnet/tenants/signup/*` | Anonymous or session routes that create or clear the session. Anonymous routes derive the tenant from the host only (`tenantForAnonymousRequest`). |
| BFF helpers | `lib/api/dotnet-bff.ts` | Base URL, upstream headers, tenant resolution (host subdomain, or the `x-target-tenant` override for root operators), real client IP from `X-Forwarded-For` (`TRUSTED_PROXY_HOPS`), session cookie set/clear. |
| Session | `lib/api/dotnet-session.ts`, `dotnet-session-refresh.ts`, `dotnet-server-session.ts` | Cookie `fsh_sid` (httpOnly, SameSite=Lax) holds only an opaque id. Refresh happens 30 s before expiry, single-flight, with compare-and-set on the refresh token. Transient refresh failures return 503 and do not log the user out. Server Components use `getDotnetSession()` / `dotnetServerGet()` / `dotnetServerPost()`. |
| Token store | `lib/api/dotnet-token-store.ts` | Uses Redis when `REDIS_URL` is set (prod; sessions survive redeploys and are shared by replicas). Otherwise a `globalThis` in-memory map (dev/test). JWTs never go in cookies because they can exceed 4 KB. |
| Page guard | `proxy.ts` → `lib/api/dotnet-middleware.ts` (`updateDotnetSession`) | Redirects for auth/public pages and sends tenant-subdomain sign-in to the right tenant. `/api/*` is excluded from the matcher, so BFF routes check auth themselves (`requireAuth` / `requirePermission` / `requireCSRF` in `lib/api/auth-middleware.ts`). |
| CSRF | `lib/security/csrf.ts`, `app/api/csrf/token` | Double-submit token plus an Origin/Referer check. Uses a `__Host-` cookie in production. |

Rules:

* **Never call the .NET API directly from the browser**, and never put a token in JS-readable storage.
* **Do not add new Next Route Handlers that hold business logic.** If something new is needed, add an endpoint to
  the .NET API and reach it through the catch-all proxy. Add a dedicated `app/api/*` route only for
  BFF concerns (session, CSRF, anonymous sign-up flows, system health).
* `lib/server/services/dashboard-page-service.ts` is the **only** server service left. It is a **read-only
  aggregator for Server Components** (dashboard shell context, home KPIs, license alerts, profile and
  settings page data). It calls the API through `dotnetServerGet` and maps DTOs via
  `lib/api/dashboard-dotnet.ts`. It holds no persistence and no business rules. Don't grow it into a
  service layer.

---

## 3. Folder layout

```
app/                       routes: layouts, pages, BFF route handlers (app/api/{dotnet,csrf,system-health})
components/
  ui/                      shadcn primitives (+ date-picker.tsx, nepali-date-range-picker.tsx, data-table, states)
  navigation/nav-model.ts  sidebar model + pure helpers (permission filtering, active item, route allow-check)
  dashboard-layout.tsx     app shell: sidebar sections, permission checks, AccessDenied for disallowed paths
  ...                      cross-feature UI
features/{domain}/
  api-client*.ts           UI-facing types + functions for the domain (may re-export lib/api/*-api.ts calls)
  components/ hooks/ lib/ schemas/ types.ts
lib/
  api/                     dotnet-* plumbing + {domain}-api.ts: .NET DTO types, path constants, DTO ⇄ UI mapping
  i18n/                    English/Nepali messages, provider, formatting (digits, BS dates, amount in words)
  offline/                 IndexedDB POS sales queue + retry policy
  security/                csrf.ts, rbac-types.ts (legacy permission names used by the UI)
  server/services/         dashboard-page-service.ts only (see §2)
  hooks/ utils/ ...
e2e/                       Playwright specs + mock-dotnet/ (stub .NET API)
```

**Domain calls.** `lib/api/{domain}-api.ts` declares the .NET DTOs (camelCase, mirroring the C# records) and
calls `dotnetClient`. `features/{domain}/api-client*.ts` exposes the UI shape (often legacy snake_case
types) and is what hooks and components import. Both styles exist. For a given domain, follow whichever
the domain already uses, and don't duplicate one call in both places.

---

## 4. Calling the API

* Use `dotnetClient` (browser) or `dotnetServerGet/Post` (Server Components). Never use raw `fetch` to the API.
* **Paths:** write `"/api/v1/sales"` or `"/sales"`. The client normalizes both.
* **Filters, sorting and paging run server-side.** Pass query params through and don't filter big lists
  client-side. Paginated endpoints return `PagedResponse<T>`. Map it to the UI's list shape in the api module.
* **Errors:** catch `DotnetApiError`. Show `apiRequestErrorMessage(error)` (`lib/api/client-helpers.ts`)
  or the normalized message. Validation errors come back as ProblemDetails `errors`.
* **Branches:** the API scopes lists to the caller's branch. Use `canViewAllBranches()` before showing a
  branch filter. An explicit branch is sent as `X-Branch-Id`, and the API validates it.
* **Idempotency (money and stock writes):** create a key where the user action starts and reuse it while that
  same action is retried. Use `createIdempotencyKeyTracker()` from `lib/api/idempotency.ts`. Call
  `keyFor(fingerprint)` on submit and `reset()` after success. Pass the key as `dotnetClient.post(path, body, key)`.
  The API replays the stored response for a repeated key.
* **TanStack Query mutations:** pass per-call data through `mutate(arg)`, never through state that the
  callbacks close over (repo golden rule #9).

---

## 5. Permissions

* The access token carries one `permission` claim per .NET permission (`Permissions.{Resource}.{Action}`).
  The UI still speaks the legacy names in `lib/security/rbac-types.ts` (`sales:read`, `accounting:write`, …).
* `lib/api/dotnet-permissions.ts` is the only mapping between the two:
  * `dotnetPermissionAllowed(legacy, granted)`: the user needs **any one** of the mapped .NET names.
    Unknown or unmapped names **deny** (fail closed). Root users (who hold every `IsRoot` permission) are allowed everything.
  * `isDotnetRootUser`, `canViewAllBranches`.
  * When you add a backend permission the UI needs, extend `DOTNET_PERMISSION_MAP` there. Don't check raw
    claim strings in components.
* Navigation: put `permission` / `check` on nodes in the sidebar sections (`components/navigation/nav-model.ts`
  types, sections in `dashboard-layout.tsx`). `visibleSections` filters the menu. `isPathAllowed` decides
  whether the current page renders or shows `<AccessDenied />`. Keep these helpers pure and unit-tested.
* UI checks are for UX only. **The API enforces every permission.** Never treat a hidden button as protection.

---

## 6. Next.js

* App Router only. Prefer **Server Components** for shells and initial reads (via `dotnet-server-session`).
  Use `"use client"` only for interactivity, and keep client islands small.
* Server Actions are not used. Mutations go through `dotnetClient` → proxy.
* `NEXT_PUBLIC_*` values are inlined at **build** time (Docker build args). Everything server-only
  (`DOTNET_API_URL`, `REDIS_URL`, `TRUSTED_PROXY_HOPS`, `SENTRY_*`) is runtime env. See `docs/DEPLOYMENT.md`.

---

## 7. i18n, dates and money (Nepal)

* **Languages:** English (`en`, default) and Nepali (`ne`). Messages live in `lib/i18n/messages/{en,ne}/*.ts`,
  one file per namespace. Every key must exist in both languages (`messages.test.ts` checks this).
  * Client: `useTranslations("namespace")` from `lib/i18n/i18n-provider.tsx`. Server: `getTranslations(namespace)` from `lib/i18n/server.ts`.
  * The preference is stored in the `pharmacare_locale` cookie (for SSR) plus localStorage. Nepali (Devanagari) digits are a
    separate preference (`pharmacare_ne_digits`, on by default in Nepali).
  * Format with `lib/i18n/format.ts` (`formatNumber`, `formatMoneyNe`, `groupSouthAsian`, `formatBsDate`,
    `formatAdDate`, `amountInWordsNe`). Don't hand-roll digit or lakh/crore formatting.
* **Dates:** use `components/ui/date-picker.tsx` (`DatePicker` / `DateTimePicker`) for **every** date field.
  It stores local `yyyy-MM-dd` (or `yyyy-MM-ddTHH:mm`) strings, shows AD with a BS hint, and has a BS grid toggle.
  Future dates are blocked unless the field passes `allowFuture` (`lib/utils/date-limits.ts`, Nepal time).
  For ranges, use `components/date-range-picker.tsx` / `components/ui/nepali-date-range-picker.tsx`. BS
  conversion uses `nepali-date-converter` plus `features/calendar/nepali-utils.ts`.
* Money comes from the API as numbers. Display it with the currency/format helpers. Never recompute totals,
  VAT or balances that the API already returns.

---

## 8. Offline POS sales

* `lib/offline/offline-sales-queue.ts` holds an IndexedDB queue (`pms-offline` / `offlineSales`) of the exact
  `CreateSaleData` body **plus the Idempotency-Key of the failed online attempt**. A sync therefore either
  replays the sale the server already recorded or creates it exactly once.
* Retry, backoff and failure classification are in `lib/offline/offline-sale-retry.ts` (transient vs permanent,
  first-attempt grace period). The sync hook is `features/sales/hooks/use-offline-sales-sync.ts`, and the
  indicator is `features/sales/components/offline-sales-indicator.tsx`.
* Never generate a new idempotency key for a queued sale. Keep the pure logic in the `*.ts` helpers so it
  stays unit-testable.

---

## 9. TypeScript and validation

* `strict` always. No `any` in new or touched code. Use `unknown` and narrow it.
* Interfaces for DTOs and UI models. Use **zod** for form and input validation (`features/*/schemas`). Client
  validation is for UX only, because the API validates again (FluentValidation).

---

## 10. UI (shadcn) and styling

* Compose from `components/ui`. Extend by composition, not forks. Use the shared states
  (`loading-state`, `empty-state`, `error-state`, `data-table`, `confirm-dialog`, `detail-sheet`).
* No heavy business rules in presentational components. Put calculations in `features/*/lib/*.ts` (pure,
  tested) or leave them to the API.
* Respect the design tokens and dark-mode variables in `app/globals.css`. Animation should be subtle, fast and
  purposeful, and must respect `motion-reduce`.
* Every meaningful async view has loading, empty and error states. Show toasts for mutation success or failure where the
  product already does.

---

## 11. Finance integrity (enforced by the API; don't undermine it in the UI)

* Money and stock writes are idempotent. Send an `Idempotency-Key` (§4).
* Posted vouchers are never edited. Use the API's void/reverse endpoints.
* GL posting happens server-side from integration events. The UI never posts accounting entries to
  "complete" a business flow.

---

## 12. Testing

* **Unit tests:** Vitest, `*.test.ts` next to the code, `environment: "node"` (no DOM). Run `yarn test`.
  Test pure functions: DTO mapping in `lib/api/*-api.ts`, permission mapping, nav-model, i18n formatting,
  offline retry, `features/*/lib`. Inject `fetchImpl` / backends instead of mocking globals where the
  code allows it (`createDotnetClient({ fetchImpl })`, token-store `SessionBackend`).
* **E2E:** Playwright (`yarn test:e2e`, specs in `e2e/`). The config starts `e2e/mock-dotnet/server.mjs` (a
  stub .NET API with deterministic fixtures in `fixtures.mjs`) and `next dev` with `DOTNET_API_URL`
  pointing at it. The real BFF code (session store, CSRF, proxy) runs, and only the .NET API is mocked.
  Specs can also `page.route("**/api/dotnet/**")` for per-test data. When a flow needs a new endpoint, add
  it to the mock.
* `yarn test:integration` (`*.integration.test.ts`) currently has no suites.

---

## 13. Implementation flow (adding or changing a feature)

1. **API first.** Make sure the .NET endpoint exists (repo root, `add-feature` skill). Note its route,
   permission and DTO.
2. **API module.** Add DTO types and calls in `lib/api/{domain}-api.ts` (or `features/{domain}/api-client*.ts`) using
   `dotnetClient`, mapping DTO ⇄ UI shape. Add a Vitest test for the mapping.
3. **Permission.** Map any new .NET permission in `dotnet-permissions.ts`. Gate nav/page/buttons with it.
4. **Hooks.** TanStack Query in `features/{domain}/hooks` (or `lib/hooks`).
5. **UI.** Compose shadcn components. Strings go in `lib/i18n/messages/{en,ne}`. Dates use `DatePicker`.
6. **E2E** for critical flows (POS, purchases, stock counts, VAT return…). Extend `e2e/mock-dotnet`.

---

## 14. Forbidden

* Business rules, persistence or new data services in the Next app (`app/api/*`, `lib/server/*`).
* Bearer tokens in the browser, in localStorage or in cookies. Direct browser → .NET calls.
* Mutations without CSRF (the proxy enforces it, so don't bypass the proxy).
* `any` in new or touched code. Raw permission-claim string checks in components.
* Hard-coded English in user-facing UI where the area is already translated.

---

## 15. Docs

* This file holds the rules. `CLAUDE.md` points here. Repo-wide conventions are in `/AGENTS.md` and `/.agents/rules/`.
  Architecture decisions are in `/docs/adr/`. Deploy and DR are in `docs/DEPLOYMENT.md`, `/deploy/docker/README.md` and
  `/docs/runbooks/disaster-recovery.md`.
* **Historical (completed Supabase → .NET migration, kept for reference only; don't follow as current
  guidance):** `docs/API_MIGRATION_GUIDE.md`, `docs/dotnet-migration-plan.md`,
  `docs/frontend-migration-checklist.md`, `docs/dotnet-migration-status.csv`, `docs/dotnet-cutover-changelog.md`,
  and `docs/notes/*`.

## 16. Output style when generating code

* Production quality: types, error handling, loading/empty/error states.
* **Minimal diff.** Don't refactor unrelated modules.
* Comments explain *why*, only where the logic isn't obvious.

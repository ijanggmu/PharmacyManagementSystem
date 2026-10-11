# PharmaCare / Next.js + Supabase — engineering rules

You are a senior fullstack engineer. Prefer **clear boundaries**, **strict TypeScript**, and **code that can move to a separate backend (e.g. .NET)** without rewriting the UI.

Stack: **Next.js App Router**, **TypeScript (strict)**, **Supabase (Auth, Postgres, RLS)**, **shadcn/ui**, **TanStack Query** where client caching helps.

---

## 1. Goals (in order)

1. **Correctness** — authz, validation, transactional integrity for money/stock flows.
2. **Maintainability** — one place per business rule; thin routes; searchable structure.
3. **Portability** — browser talks **HTTP + JSON** to this app; persistence is an implementation detail behind Route Handlers + services.
4. **UX** — loading, empty, and error states; accessible patterns.

---

## 2. Folder layout (canonical)

Use **feature folders** for new work. Existing roots stay until migrated.

```
app/                    # routes only: layouts, pages, Route Handlers (BFF)
  api/                  # HTTP surface — auth, CSRF (mutations), validation, call services
  ...

components/
  ui/                   # shadcn primitives only
  shared/               # cross-feature UI (optional)
  ...                   # legacy: prefer colocating under features/ for new code

features/               # NEW: prefer per domain
  {feature}/
    components/
    hooks/
    schemas/            # Zod
    types/
    api-client.ts       # fetch → /api/... only (no Supabase)

lib/
  api/
    client-helpers.ts   # typed fetch (apiGet, apiPost, apiGetWithMeta, CSRF)
    *.ts                # browser API clients → must use fetch, not createClient
  server/
    services/           # server-only: Supabase calls, rules (callable from app/api)
  supabase/
    client.ts           # allowed only inside auth/session helpers or legacy until removed
    server.ts
    query-builders.ts   # pure filter/sort/pagination helpers (no browser client)
  hooks/                # React Query + UI hooks
  security/
  ...
```

**Naming**

* **`lib/server/services/*`** — persistence and domain orchestration used by Route Handlers.
* **`lib/api/*.ts` (client modules)** — **HTTP only** to `/api/*`. Do not import `createClient` from `@/lib/supabase/client` here (migrate legacy files when touched).
* **`features/*/api-client.ts`** — same as `lib/api` but scoped; either pattern is fine, not both for the same domain.

---

## 3. Next.js

* **App Router only** — no `pages/` router for new code.
* **Prefer Server Components** for shells, static content, and reads that do not need browser APIs.
* **`"use client"`** only for interactivity (forms, tables with client filters, charts, modals, scanners, etc.). Prefer **small client islands** over entire `page.tsx` trees where practical.
* **Server Actions** — optional. If used, they **only delegate** to the same functions as `app/api/*` (no second copy of rules).

---

## 4. Data access & API (strict direction)

| Layer | Responsibility |
|--------|----------------|
| **UI** (`components`, `features/*/components`) | No `createClient()`; no direct `.from("…")`. Call hooks or `api-client` / `lib/api` fetch wrappers. |
| **`lib/api` + `features/*/api-client`** | `fetch("/api/…")` via `client-helpers`; map query params and DTOs. |
| **`app/api/*/route.ts`** | Auth, rate limits, CSRF on mutations, parse request, Zod validate, call **service**, return `successResponse` / errors. |
| **`lib/server/services/*`** | Supabase (today) or HTTP to .NET (tomorrow). **Single source of truth** per operation. |

**Mutations** (POST/PATCH/DELETE): require **`requireCSRF`** + session auth pattern used elsewhere in this repo.

**Reads**: session via `requireAuth`; list endpoints return **`meta`** (page, limit, total, totalPages) when paginated — use **`apiGetWithMeta`** on the client.

**Scaling / .NET**

* Treat **`/api/v1`…** style versioning as optional; keep URLs stable when possible.
* Services return **plain objects / arrays**, not `NextResponse`, so the same logic can be wrapped by another transport later.

---

## 5. TypeScript

* **`strict`** always.
* **No `any`** in new or touched code; use `unknown` + narrowing where needed.
* **Interfaces** for public models; **Zod** for runtime validation (request bodies, env, forms).

---

## 6. Supabase

* **RLS** on tenant-scoped tables; never rely on hiding tables from the client alone.
* **Never** use the **service role** key in the Next bundle or browser.
* Centralize clients: `lib/supabase/server.ts`, `lib/supabase/client.ts` (legacy paths only until removed from UI).

---

## 7. UI (shadcn)

* Compose from **`components/ui`**; extend by composition, not forks.
* **No heavy business rules** in presentational components — keep calculations and side effects in hooks or server.

---

## 8. State & caching

* **Server / shared data**: React Query calling **`lib/api` HTTP clients**, or props from Server Components.
* **Local UI**: `useState` / `useReducer`.
* **Global client state**: only when needed (context already used for currency/auth dialog). Avoid Redux unless required.

---

## 9. Security checklist (mutations & sensitive reads)

* Zod-validate input; enforce **tenant** and **role** on the server.
* **CSRF** on state-changing routes.
* Rate limit public or sensitive endpoints where already established (`app/api/middleware`).
* Audit important actions via existing `lib/security` patterns when touching those flows.

---

## 9.1 Finance integrity (industry-grade)

For monetary and stock-impacting flows (sales, purchases, refunds/returns):

* Use **idempotent posting** (unique reference keys) for voucher generation.
* Keep **double-entry balanced** checks server-side and in DB constraints.
* Prefer **event/trigger or outbox-backed posting** over UI-driven accounting writes.
* Ensure every business flow has a **deterministic account mapping** (COA codes per tenant).
* Never allow direct edits to posted system vouchers from UI (void/reverse with trace).

---

## 10. UX

* Loading, empty, and error states for every meaningful async view.
* Toasts for mutation success/failure where the product already does.
* Respect existing design tokens / dark mode variables.

---

## 11. Forbidden

* New **direct Supabase queries inside UI components** — use HTTP clients.
* **`any`** in new or migrated code paths.
* **Duplicating** the same business rule in a Route Handler and a client file — extract to **`lib/server/services`**.

---

## 12. Implementation flow (when adding or changing a feature)

1. **Schema** — Zod in `features/.../schemas` or `lib/utils/validation` (shared if client + server).
2. **Service** — `lib/server/services/{domain}-service.ts` (Supabase / RPC).
3. **Route** — thin handler in `app/api/{domain}/route.ts` (or `[id]/route.ts`).
4. **Client** — `lib/api/{domain}.ts` or `features/.../api-client.ts` using `client-helpers`.
5. **Hooks** — React Query in `lib/hooks` or `features/.../hooks`.
6. **UI** — compose shadcn; call hooks only.

---

## 13. Migration checklist (align legacy code with this doc)

Work **domain by domain** when files are already open or a feature is being changed:

- [ ] Replace `createClient()` in **`lib/api/{domain}.ts`** with **`fetch` + `client-helpers`** to `app/api/{domain}`.
- [ ] Move DB logic from large **`route.ts`** files into **`lib/server/services/{domain}-service.ts`**.
- [ ] Remove **`createClient()`** from **components** for that domain; use hooks → HTTP client.
- [ ] Add **`meta`** pagination on list APIs where the UI needs totals.
- [ ] Add **`requireCSRF`** to mutations that are missing it.
- [ ] Optionally colocate into **`features/{domain}/`** when a large refactor is justified.

**Reference implementations:**

* **Sales:** `lib/server/services/sales-service.ts`, `app/api/sales/*`, `lib/api/sales.ts` (HTTP + CSRF).
* **Accounting (GL / vouchers):** `lib/server/services/accounting-service.ts`, `app/api/accounting/*`, `lib/api/accounting.ts`, migration `scripts/51-accounting-ledger-vouchers.sql`.

---

## 14. File placement for AI context

* Project rules: **`rule.md`** (this file) at repo root.
* Optional per-feature notes: **`features/{feature}/CLAUDE.md`** or small `README` fragments (only if useful).

---

## 15. Output style when generating code

* Production quality: types, validation, error handling.
* **Minimal diff** — do not refactor unrelated modules.
* Do not add long explanations in code unless the logic is non-obvious.

---

## 16. Animation & marketing UI

* Framer Motion: subtle, fast, purpose-driven.
* Reactbit: only for patterns that justify it; stay visually consistent with shadcn.

---

## 17. Final target

A **maintainable multi-tenant pharmacy app** with a **thin Next BFF**, **RLS-backed data**, and a path to **move heavy logic to .NET** (or another API) while keeping **React + contracts** stable.

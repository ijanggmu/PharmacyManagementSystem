# PharmaCare — System Design

> Multi-tenant pharmacy management SaaS (POS, inventory, purchasing, accounting, compliance) for pharmacies in Nepal.
> **Frontend:** Next.js 16 (App Router) acting as a BFF. **Backend:** a modular-monolith .NET 10 API on PostgreSQL.
>
> This document describes the state of branch `feature/dotnet-frontend`, where the **.NET API is the only backend**. The earlier Supabase design is summarized in [§13 Legacy architecture](#13-legacy-architecture-supabase) for reference.

---

## Table of contents

1. [High-level architecture](#1-high-level-architecture)
2. [Tech stack at a glance](#2-tech-stack-at-a-glance)
3. [Frontend architecture](#3-frontend-architecture)
4. [Design system: fonts, colors, UI](#4-design-system-fonts-colors-ui)
5. [Libraries](#5-libraries)
6. [BFF layer & request flow](#6-bff-layer--request-flow)
7. [Backend (.NET) architecture](#7-backend-net-architecture)
8. [Authentication, tenancy & authorization](#8-authentication-tenancy--authorization)
9. [Business domains](#9-business-domains)
10. [Accounting & finance integrity](#10-accounting--finance-integrity)
11. [Configuration & environment](#11-configuration--environment)
12. [Testing, CI & deployment](#12-testing-ci--deployment)
13. [Legacy architecture (Supabase)](#13-legacy-architecture-supabase)
14. [Known limitations & roadmap](#14-known-limitations--roadmap)
15. [Related documents](#15-related-documents)

---

## 1. High-level architecture

```
┌──────────────────────────┐        same-origin HTTPS         ┌──────────────────────────────┐
│ Browser                  │  ─────────────────────────────▶  │ Next.js 16 (Node runtime)     │
│ React 19 + React Query   │   /api/dotnet/*  + CSRF token    │  • App Router pages (RSC)     │
│ httpOnly session-id      │  ◀─────────────────────────────  │  • proxy.ts (route guard)     │
│ cookie (no JWT in JS)    │                                  │  • BFF: /api/dotnet/[...path] │
└──────────────────────────┘                                  │  • Session/token store        │
                                                              └──────────────┬───────────────┘
                                                                             │ Bearer JWT
                                                                             │ tenant header
                                                                             ▼
                                                              ┌──────────────────────────────┐
                                                              │ .NET 10 API (FSH Starter Kit) │
                                                              │  Minimal APIs  /api/v1/...    │
                                                              │  Modules · Mediator · EF Core │
                                                              └───┬───────────┬──────────┬───┘
                                                                  │           │          │
                                                           PostgreSQL   Redis/Valkey   S3 storage
                                                          (per-module    (cache)      (files)
                                                           DbContexts)   Hangfire jobs
```

**Key principles** (from `rule.md`):

- **Correctness first:** server-side authorization, validation, and transactions for every money or stock flow.
- **Thin UI:** the browser only speaks HTTP + JSON to its own origin. It never talks to the database or holds the JWT.
- **One place per business rule:** domain rules live in the .NET modules. The frontend renders state and validates forms.
- **Portability:** the frontend is backend-agnostic behind `lib/api/*` and `features/*/api-client.ts`.

---

## 2. Tech stack at a glance

| Layer | Technology |
|---|---|
| Framework | **Next.js 16.0.10** (App Router, Turbopack), **React 19.2** |
| Language | **TypeScript 5** (strict) |
| Styling | **Tailwind CSS v4** (CSS-first config) + `tw-animate-css` |
| Component system | **shadcn/ui** (style `new-york`) on **Radix UI** primitives |
| Icons | **lucide-react** |
| Fonts | **Inter** (body) + **Plus Jakarta Sans** (display), via `next/font/google` |
| Server state | **TanStack React Query** (+ devtools) |
| Validation | **Zod 3.25** |
| Charts | **Recharts** |
| Export | `jspdf` + `jspdf-autotable` (PDF), `xlsx` (Excel), `file-saver` |
| Dates | `date-fns`, `react-day-picker`, `nepali-date-converter` (Bikram Sambat) |
| Backend | **.NET 10**, ASP.NET Core Minimal APIs, FullStackHero Starter Kit |
| ORM / DB | **EF Core 10** + Npgsql → **PostgreSQL** |
| Backend libs | Mediator (source-gen), FluentValidation, Finbuckle.MultiTenant, Hangfire, Serilog, OpenTelemetry, Asp.Versioning, Scalar |
| Cache | Redis / Valkey |
| Auth | ASP.NET Identity + JWT bearer + refresh tokens |
| Tests | **Vitest 4** (frontend), xUnit test projects (backend) |
| Package manager | **Yarn 4.12** (`node-modules` linker) |

---

## 3. Frontend architecture

### 3.1 Folder layout

```
app/                     # Routes only: layouts, pages, BFF route handlers
  layout.tsx             # Fonts, metadata, providers
  globals.css            # Tailwind v4 theme + design tokens
  page.tsx               # Landing (+ ?auth=signin|onboarding|forgot dialog)
  auth/  onboarding/  reset-password/  privacy/  terms/
  t/[slug]/              # Tenant-slug login & dashboard entry
  dashboard/             # Authenticated application (see 3.2)
  api/
    csrf/token/          # Issues CSRF tokens
    dotnet/[...path]/    # Catch-all BFF proxy to the .NET API
    dotnet/auth/*        # login, logout, refresh, register, session, forgot/reset password
    dotnet/tenants/signup
components/
  ui/                    # shadcn primitives (+ data-table, nepali date pickers, states)
  layouts/               # page-container, page-header, section
  shared/                # stat-card, …
  dashboard-layout.tsx, command-palette.tsx, app-tour.tsx, branch-switcher.tsx, …
features/{domain}/       # Per-domain feature folders
  api-client*.ts         # fetch → /api/dotnet/* only
  components/  hooks/  schemas/ (Zod)  types.ts
lib/
  api/                   # dotnet-client, BFF/session helpers, per-domain .NET clients
  security/              # csrf.ts, rbac-types.ts
  contexts/              # auth-dialog, currency
  design-system/         # tokens.ts, standards.ts
  inventory/fefo.ts      # First-expiry-first-out batch picking
  offline/               # Offline sales queue
  utils/                 # barcode, dates, document numbers, excel, formatting, validation…
  query-client.tsx       # React Query provider
  tenant-host.ts         # Tenant resolution from host / subdomain
proxy.ts                 # Next 16 "proxy" (middleware) — page protection
backend/dotnet-starter-kit/   # .NET API (git submodule)
docs/                    # Design & migration docs
```

**Feature domains in `features/`:** accounting (+ bank-reconciliation), bank-deposits, branches, calendar, cash-shifts, customer-payments, customers, dashboard, expenses, inventory, medicines, migration, prescriptions, purchases, refunds, returns, sales, settings, suppliers, tenants, users.

### 3.2 Routes (`/dashboard`)

| Area | Routes |
|---|---|
| Home | `/dashboard` |
| Sales / POS | `sales`, `sales/new`, `cashier` |
| Returns | `returns`, `returns/new`, `refunds`, `refunds/new` |
| Inventory | `inventory`, `inventory/consignment`, `inventory/expired`, `inventory/movements`, `stock-transfers` |
| Purchasing | `purchases`, `suppliers` |
| Customers | `customers`, `prescriptions`, `prescriptions/add` |
| Finance | `expenses`, `reports/accounting/*` (overview, journal, ledger, register, trial-balance, statements, receivables, payables, cash, bank-reconciliation, reconciliation, chart-of-accounts, vat) |
| Compliance reports | `reports/ird`, `reports/dda-narcotic`, `reports/dead-stock`, `reports/audit-logs` |
| Admin | `branches`, `settings`, `settings/opening-balances`, `settings/system-logs`, `profile`, `system-health` |
| Platform (SuperAdmin) | `tenants`, `tenants/billing`, `tenants/[tenantId]/overview`, `tickets`, `tickets/all-tenants` |

### 3.3 Data-flow rules

| Layer | Responsibility |
|---|---|
| UI components | No direct backend access. They call hooks only. |
| `features/*/hooks` | React Query `useQuery` / `useMutation` wrapping the API clients. |
| `lib/api/*`, `features/*/api-client.ts` | Typed `fetch` against `/api/dotnet/*` through `dotnet-client.ts`. |
| `app/api/dotnet/*` | BFF: CSRF, session lookup, token refresh, tenant headers, forwarding. |
| .NET API | Business rules, persistence, authorization. |

### 3.4 State management

- **Server state:** React Query (`lib/query-client.tsx`) with `staleTime` 5 min and `gcTime` 10 min. 4xx errors are not retried; other errors retry up to 3 times. There is no refetch on window focus, and mutations retry once.
- **Local UI state:** `useState` / `useReducer`.
- **Global client state:** React context only (`CurrencyContext`, `AuthDialogContext`). There is no Redux or Zustand.
- **Offline:** `lib/offline/offline-sales-queue.ts` queues POS sales while offline and syncs them later (`use-offline-sales-sync`).

---

## 4. Design system: fonts, colors, UI

### 4.1 Typography

| Role | Font | Loaded via | CSS variable | Tailwind |
|---|---|---|---|---|
| Body / UI | **Inter** (latin, `display: swap`) | `next/font/google` in `app/layout.tsx` | `--font-inter` → `--font-sans` | `font-sans` (on `<body>`) |
| Display / headings | **Plus Jakarta Sans** | `next/font/google` in `app/layout.tsx` | `--font-plus-jakarta` → `--font-display` | `font-display` |

- Fonts are self-hosted at build time by `next/font`. There are no external font requests, `<link>` tags, or `@font-face` rules.
- The type scale is defined as the utilities `.text-heading-1` … `.text-heading-6` in `globals.css`. Headings 1–3 use the display font.
- `<body>` uses `antialiased`.

### 4.2 Color & tokens (`app/globals.css`)

The theme is a **"clinical teal"** brand with cool slate neutrals, aiming for WCAG AA contrast. All tokens are **oklch** values defined in `:root` and `.dark`, and exposed to Tailwind through `@theme inline`.

| Token group | Notes |
|---|---|
| `primary` | Teal-700 `oklch(0.511 0.096 186.391)` (light); teal-400 in dark mode |
| `background`, `foreground`, `card`, `popover` | Surfaces |
| `secondary`, `muted`, `accent` | Accent is a teal tint |
| `destructive`, `success`, `warning`, `info` | Status colors |
| `border`, `input`, `ring` | Form and focus |
| `chart-1` … `chart-5` | Recharts series palette |
| `sidebar-*` | Dashboard sidebar |
| `--shadow-xs/sm/md/lg` | Elevation scale |
| `--radius: 0.75rem` | `radius-sm/md/lg/xl` derived from it |

- **Browser theme color:** `#0f766e` (teal-700).
- **Dark mode:** the full `.dark` token set exists, but no theme toggle or `next-themes` is wired up yet.
- **Utility classes:** `.focus-ring`, `.card-shadow`, `.space-section`, `.space-content`, `.no-print` (print), thin scrollbars, a `prefers-reduced-motion` override, and a pointer cursor on interactive elements.
- **TypeScript tokens:** `lib/design-system/tokens.ts` and `standards.ts` mirror the tokens for use in JS (charts, PDFs).

### 4.3 Component library

shadcn/ui (`components.json`): style `new-york`, RSC enabled, base color `neutral`, CSS variables enabled, icon library `lucide`.

**Primitives in `components/ui/`:** alert, avatar, badge, button, calendar, card, command, confirm-dialog, data-table, dialog, dropdown-menu, dual-date-input, empty-state, error-state, field-error, input, label, loading-state, multi-select, nepali-date-picker-field, nepali-date-range-picker, pagination, popover, progress, select, separator, sheet, skeleton, switch, table, tabs, textarea, toast/toaster.

**UX patterns:**

- Every async view has a loading state (`loading-state`, `skeleton`), an empty state (`empty-state`) and an error state (`error-state`).
- Mutations report their result with toasts.
- Destructive actions go through `confirm-dialog`.
- Navigation aids: a command palette (`cmdk`), keyboard shortcuts (`use-keyboard-shortcut`) and a guided app tour.
- Dates can be shown in both calendars (AD/BS) with the Nepali date pickers.

---

## 5. Libraries

### Frontend runtime

| Library | Purpose |
|---|---|
| `next`, `react`, `react-dom` | Framework |
| `@radix-ui/react-*` | Accessible primitives (dialog, dropdown, popover, select, tabs, toast, tooltip, switch, …) |
| `class-variance-authority`, `clsx`, `tailwind-merge` | Variant styling and `cn()` helper |
| `cmdk` | Command palette, comboboxes |
| `lucide-react` | Icons |
| `@tanstack/react-query` (+ devtools) | Server-state caching |
| `zod` | Schema validation for forms and DTOs |
| `recharts` | Dashboard and report charts |
| `jspdf`, `jspdf-autotable` | PDF invoices and reports |
| `xlsx`, `file-saver` | Excel import/export, downloads |
| `date-fns`, `react-day-picker` | Dates, calendar picker |
| `nepali-date-converter` | AD ↔ BS (Bikram Sambat) conversion |
| `axios` | Installed but unused by the .NET client, which uses `fetch` |

### Frontend dev

`tailwindcss` v4, `@tailwindcss/postcss`, `postcss`, `autoprefixer`, `tw-animate-css`, `typescript`, `vitest`, `@vitest/coverage-v8`.

### Backend (.NET, `src/Directory.Packages.props`)

EF Core 10 + Npgsql, ASP.NET Identity, JWT bearer, Mediator (source generator), FluentValidation 12, Finbuckle.MultiTenant 10, Hangfire, StackExchange Redis (Valkey), Serilog, OpenTelemetry, Asp.Versioning, Scalar (API docs), AWSSDK.S3, .NET Aspire (local orchestration).

---

## 6. BFF layer & request flow

```
Browser                         Next.js BFF                               .NET API
   │  GET /api/csrf/token           │                                         │
   │ ─────────────────────────────▶ │                                         │
   │  POST /api/dotnet/sales        │                                         │
   │  X-CSRF-Token, Idempotency-Key │                                         │
   │  Cookie: session-id            │                                         │
   │ ─────────────────────────────▶ │ 1. verify CSRF                          │
   │                                │ 2. resolve tenant (host / override)     │
   │                                │ 3. load session → access token          │
   │                                │ 4. refresh token if near expiry         │
   │                                │ 5. forward ─────────────────────────────▶ /api/v1/sales
   │                                │    Authorization: Bearer <jwt>          │
   │                                │    tenant header                        │
   │ ◀───────────────────────────── │ ◀──────────────── JSON / RFC 7807 ───── │
```

| File | Role |
|---|---|
| `lib/api/dotnet-client.ts` | Browser client: same-origin `/api/dotnet`, 15 s timeout, automatic CSRF for mutations, `Idempotency-Key` support |
| `lib/api/dotnet-problem.ts` | Maps RFC 7807 `ProblemDetails` to typed errors |
| `app/api/dotnet/[...path]/route.ts` | Catch-all proxy |
| `lib/api/dotnet-bff.ts`, `dotnet-session.ts`, `dotnet-server-session.ts` | Session cookies and server session lookup |
| `lib/api/dotnet-token-store.ts` | Server-side token store (in-memory `Map` on `globalThis`) |
| `lib/api/dotnet-middleware.ts`, `proxy.ts` | Page protection and redirects |
| `lib/api/tenant-override-header.ts` | SuperAdmin cross-tenant scoping |

**Why a BFF?** The JWT can exceed the 4 KB cookie limit and should never be readable from JS. The browser holds only an opaque **httpOnly session-id cookie**, and the BFF attaches the bearer token on the server.

---

## 7. Backend (.NET) architecture

**Location:** `backend/dotnet-starter-kit/` (git submodule, based on the FullStackHero .NET Starter Kit). Solution file: `src/FSH.Starter.slnx`. Target: `net10.0`, with warnings treated as errors.

### 7.1 Style

- A **modular monolith**. Each module has `Modules.X` (implementation) and `Modules.X.Contracts` (public DTOs and commands), plus **its own EF Core DbContext**.
- **Vertical slices:** `Features/v1/<Slice>/` holds the endpoint, command/query, handler and validator together.
- **Minimal APIs** (no MVC controllers), versioned as `api/v{version}/…`.
- **CQRS-style** dispatch through Mediator, with FluentValidation in the pipeline.
- **Outbox / eventing** for cross-module side effects (for example, accounting posting), plus webhooks.

### 7.2 Hosts

| Project | Purpose |
|---|---|
| `Host/FSH.Starter.Api` | HTTP API (Dockerfile included) |
| `FSH.Starter.AppHost` | .NET Aspire: Postgres + pgAdmin, Valkey + RedisInsight |
| `FSH.Starter.DbMigrator` | Applies migrations |
| `FSH.Starter.Migrations.PostgreSQL` | EF migrations |

### 7.3 Building blocks

Caching · Core · Eventing (+Abstractions) · Jobs (Hangfire) · Mailing · Persistence · Quota · Shared · Storage (S3) · Web.

### 7.4 Domain modules

| Module | Feature slices |
|---|---|
| **Catalog** | Brands, Categories, Products |
| **Inventory** | Medicines, MedicineCatalog (Nepal catalog), Batches, Transactions, StockTransfers, Consignment, Reports |
| **Sales** | Sales, CashShifts, Returns, Refunds, Ird, Reports (+ dispensing safety contracts, jobs) |
| **Purchasing** | PurchaseOrders, DirectGoodsReceipts, Reports |
| **Suppliers** | Suppliers, Ledger, Returns, CostHistory |
| **Customers** | Customers, Ledger, Reports |
| **Prescriptions** | Prescriptions, Refills, Reports |
| **Accounting** | Accounts, Vouchers, Banking, Expenses, PostingLock, Reports |
| **Reference** | Categories, Dashboard, Settings, TenantSettings |
| **Onboarding** | Onboarding, Migration |
| **Billing** | Plans, Subscriptions, Invoices, Usage, Wallets |
| **Tickets** | Support tickets |

**Platform modules:** Identity, Multitenancy (tenants + branches), Auditing, Notifications, Files, Chat, Webhooks.

### 7.5 Tests

There are about 25 test projects under `src/Tests/`: per-module tests, architecture tests, integration tests and cross-module transaction tests.

---

## 8. Authentication, tenancy & authorization

### 8.1 Authentication

1. The user signs in through `POST /api/dotnet/auth/login`.
2. The BFF calls .NET Identity and receives an **access JWT and a refresh token**.
3. The tokens are stored server-side, and the browser receives an **httpOnly session-id cookie**.
4. `proxy.ts` protects `/dashboard/*`. The BFF refreshes tokens automatically when they are close to expiry.
5. Other flows: register, tenant signup, forgot/reset password, logout, session.

### 8.2 Multi-tenancy

- The tenant is resolved from the **subdomain** (`{code}.NEXT_PUBLIC_TENANT_ROOT_DOMAIN`, see `lib/tenant-host.ts`) or the `/t/[slug]` path, and sent to .NET as a tenant header.
- The backend uses **Finbuckle.MultiTenant**. All tenant-scoped data is filtered by tenant.
- The **root tenant** is the platform operator (SuperAdmin), who can scope calls to another tenant through the override header.

### 8.3 Roles & permissions

| Layer | Model |
|---|---|
| Frontend roles (`lib/security/rbac-types.ts`) | `superadmin`, `admin`, `manager`, `pharmacist`, `cashier`, `staff` |
| Frontend permissions | `{inventory,sales,prescriptions,customers,suppliers,users}:{read,write,delete}`, `reports:read`, `accounting:{read,write}`, `settings:{read,write}`, `tenants:{read,write}`, `controlled_substances:dispense` |
| Backend roles | Admin, Basic (minimal: lookups, settings view, notifications) + seeded Manager, Pharmacist, Cashier, Staff, Accountant (`PharmacyRoleSeedData.cs`) |
| Backend permissions | JWT `permission` claims named `Permissions.{Resource}.{Action}` |
| Mapping | `lib/api/dotnet-permissions.ts` maps each frontend permission to one or more .NET permissions. An unmapped permission is denied (**fails closed**). |

The backend is authoritative. Frontend checks only show or hide UI.

### 8.4 Branches

- Tenants can run multiple branches (`api/v1/branches`, permission `Permissions.Branches.Manage`).
- Stock is tracked per branch, and stock transfers move goods between branches.
- The top-bar branch switcher (`components/branch-switcher.tsx`) reads `GET /branches/context` and saves the choice with `POST /branches/switch` (stored as the user's current branch). Users with `Permissions.Branches.ViewAll` can switch to any active branch; others see their branch read-only. Writes land on the current branch; branch-scoped lists and reports default to it and take an optional `branchId`. See `docs/branch-scoping-plan.md`.

### 8.5 Security controls

- CSRF tokens on all mutating BFF requests.
- Idempotency keys on money and stock mutations (sales and similar).
- Security headers in `next.config.mjs`: HSTS, `X-Frame-Options: SAMEORIGIN`, `nosniff`, `Referrer-Policy`.
- Errors use RFC 7807 problem details, which are mapped to user-friendly messages.
- Audit logging happens in the Auditing module.

---

## 9. Business domains

| Domain | Capabilities |
|---|---|
| **Sales / POS** | Barcode scan, split payments (cash/credit), item discounts, FEFO batch deduction, dispensing safety checks (drug interactions, allergies, controlled substances, prescription required), cancellation, offline queue, invoice and credit-note numbering |
| **Cash shifts** | Open/close a till. Cash variance is posted to the GL. |
| **Returns & refunds** | Customer returns and refunds. Supplier returns. |
| **Medicines & inventory** | Medicine master data, categories, batches with expiry, per-branch stock, movements, expired-batch tracking and recall, dead stock, price history and scheduled price changes, Nepal medicine catalog, bulk CSV/Excel import, rack locations, reorder suggestions |
| **Stock transfers** | Inter-branch transfers with an in-transit state |
| **Consignment** | Consignment receipts, positions and settlements |
| **Purchasing** | Purchase orders, approval, goods receipts (GRN), direct GRNs |
| **Suppliers** | AP ledger, payments, statements, cost history |
| **Customers** | AR ledger, receipts and allocations, insurance details |
| **Prescriptions** | Prescriptions and refills |
| **Accounting** | See §10 |
| **Compliance (Nepal)** | IRD invoice reporting queue, DDA narcotic register, audit logs, VAT return, BS dates |
| **Platform** | Tenant onboarding wizard, data migration, billing (plans, subscriptions, invoices, wallets), support tickets, notifications, system health and logs |

---

## 10. Accounting & finance integrity

- **Double-entry general ledger** with a per-tenant chart of accounts.
- **Automatic vouchers** are posted for every business event (sale, purchase, return, refund, payment, cash variance, expense). The event → voucher mapping is in `docs/accounting-event-voucher-matrix.md`.
- **Idempotent posting** uses unique reference keys, so retries never double-post.
- **Balanced-voucher constraint:** debits must equal credits, enforced server-side.
- **Posted vouchers are immutable.** Corrections are made by **void** or **reverse**, which keeps an audit trail.
- **Posting lock** per fiscal period.
- **Reports:** voucher register, journal, general ledger, trial balance (flat and grouped), balance sheet, P&L, AR/AP aging, AR/AP/inventory-to-GL reconciliation, cash movement, VAT return.
- **Banking:** bank deposits, statement import, reconciliation with auto-match.
- **Opening balances** are set in settings.
- **Multi-currency display** (USD/EUR/GBP/INR/NPR) via `lib/currency/convert.ts` and FX rates from env vars. NPR is the base currency.

---

## 11. Configuration & environment

Frontend variables (`.env.example`, validated at startup in `lib/utils/env-validation.ts`):

| Variable | Scope | Purpose |
|---|---|---|
| `DOTNET_API_URL` | server | .NET API base URL (default `http://localhost:5030`) |
| `NEXT_PUBLIC_APP_URL` | public | Canonical app URL |
| `NEXT_PUBLIC_TENANT_ROOT_DOMAIN` | public | Root domain for tenant subdomains |
| `NEXT_PUBLIC_SUPPORT_EMAIL`, `_PHONE`, `NEXT_PUBLIC_ONBOARDING_EMAIL` | public | Contact info |
| `NEXT_PUBLIC_USD_TO_NPR_RATE` (etc.) | public | Display FX rates |
| `ENCRYPTION_KEY`, `HASH_SALT` | server | Legacy, kept for compatibility |

Backend (production) requires: `DatabaseOptions:ConnectionString`, `CachingOptions:Redis`, `JwtOptions:SigningKey`.

---

## 12. Testing, CI & deployment

### Testing

- **Vitest 4** (`vitest.config.mts`): node environment, colocated `*.test.ts`, v8 coverage.
- **Integration tests:** `yarn test:integration` (`vitest.integration.config.mts`) against a real Postgres database.
- **Backend:** `dotnet test` over the `src/Tests/*` projects.

### CI (`.github/workflows/ci.yml`)

Runs on push/PR to `main` with Node 20: `yarn install --immutable` → `yarn lint` → `yarn build`.

- CI does **not** run `yarn test` yet.
- `next lint` was removed in Next 16 and the repo has no ESLint config, so the lint step should be replaced.
- The backend submodule has its own workflows: backend, frontend, CodeQL, template smoke.

### Deployment

| Component | Target |
|---|---|
| Next.js | A Node server (Vercel or similar). It must run as a **single instance** until the token store moves to Redis. |
| .NET API | Docker image (`Host/FSH.Starter.Api/Dockerfile`), plus the DbMigrator image |
| Infrastructure | `deploy/docker/docker-compose.yml`, Terraform, Dokploy; Aspire for local development |
| Data | PostgreSQL, Redis/Valkey, S3-compatible storage |

---

## 13. Legacy architecture (Supabase)

Before the .NET cutover, the system ran on **Supabase**:

- Next.js Route Handlers (about 290 `app/api/**` routes) called server services (`lib/server/services/*`), which called Supabase Postgres.
- Business logic lived in **Postgres RPCs and triggers**, for example `create_sale_with_items`, `deduct_fefo_batches`, `receive_purchase_goods`, `accounting_post_*_voucher` and `accounting_assert_posting_open`.
- **RLS** isolated tenants using `current_tenant_id()`, `current_user_role()` and `is_superadmin()`.
- Schema changes were 104 numbered SQL scripts in `scripts/`, run by `scripts/run-migrations.js`.
- Auth used Supabase Auth with `@supabase/ssr` cookie sessions.

During the transition, a per-area switch (`lib/api/backend-target.ts`, `NEXT_PUBLIC_BACKEND_TARGET_<AREA>`) routed each domain to either Supabase or .NET. That code is removed on this branch. See `docs/dotnet-migration-plan.md` and `docs/dotnet-cutover-changelog.md`.

---

## 14. Known limitations & roadmap

| Item | Status / plan |
|---|---|
| Token store is in-memory | Move to Redis to allow multiple instances or serverless hosting |
| Branch context endpoint | Not available in .NET yet, so the branch switcher is hidden (`docs/branch-scoping-plan.md`) |
| Dark mode | Tokens are defined but there is no toggle (add `next-themes` or similar) |
| Lint in CI | Replace `next lint` with the ESLint CLI and add a config |
| Tests in CI | Add `yarn test` to the workflow |
| `axios` dependency | Unused, can be removed |
| `docs/DEPLOYMENT.md` | Still describes Supabase and needs updating |
| Package name | Still `my-v0-project`, should be renamed |

---

## 15. Related documents

- `rule.md` — engineering rules (authoritative)
- `docs/dotnet-migration-plan.md`, `docs/dotnet-cutover-changelog.md`, `docs/dotnet-migration-status.csv`
- `docs/frontend-migration-checklist.md`, `docs/API_MIGRATION_GUIDE.md`
- `docs/accounting-event-voucher-matrix.md`, `docs/accounting-integration-audit.md`
- `docs/branch-scoping-plan.md`, `docs/DEPLOYMENT.md`
- `backend/dotnet-starter-kit/docs/pharmacy-modules-plan.md`, `backend/dotnet-starter-kit/CLAUDE.md`

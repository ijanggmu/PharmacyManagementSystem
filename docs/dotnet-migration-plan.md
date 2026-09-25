# PharmaCare → .NET Backend Migration

**Full project plan, API contract, and validation specification for moving all backend and database logic from Next.js Route Handlers + Supabase (Postgres RLS/triggers) into a standalone ASP.NET Core Web API.**

Status: planning document. Ground truth for the "current state" sections was taken from `rule.md`, `lib/server/services/*`, `app/api/**/route.ts`, and `scripts/*.sql` on 2026-09-09. Re-verify against the repo before executing any phase, since this is a living codebase.

---

## 0. What "move everything to .NET" actually means here

Today, business logic lives in **three places**, not one:

1. **Route handlers** (`app/api/**/route.ts`) — thin in the good cases, but some still embed validation/authorization inline.
2. **Service layer** (`lib/server/services/*.ts`) — Supabase queries + orchestration.
3. **Postgres itself** — RLS policies, `SECURITY DEFINER` functions, and triggers (238 occurrences of `CREATE POLICY`/`FUNCTION`/`TRIGGER` across 60 SQL files). This is the part people forget: things like **auto-voucher posting on sale**, the **balanced double-entry constraint**, **FEFO batch deduction**, and **tenant/branch isolation** are enforced *inside the database*, not in TypeScript.

"Full migration to .NET" therefore has two independent axes, and this plan treats them separately because they carry very different risk:

| Axis | What moves | Risk |
|---|---|---|
| **A. Application logic** | Route handlers + services → ASP.NET Core controllers/minimal APIs + application services | Low–medium (mechanical port, testable 1:1) |
| **B. Data logic** | RLS policies, triggers, `SECURITY DEFINER` functions, DB-level CHECK constraints that encode business rules → C# transaction scripts + EF Core / Dapper | **High** — this is where money and stock correctness live |

**Recommendation:** keep **PostgreSQL** as the database engine (via Npgsql), do **not** re-platform to SQL Server. The schema, 104 numbered migrations, FEFO batch logic, and fiscal/VAT logic are already Postgres-shaped and correct in production; the actual ask ("shift DB logic to .NET") is about **removing logic from inside Postgres** (RLS/triggers/functions) and re-implementing it as **explicit, testable C# code with the DB reduced to a dumb, well-indexed relational store**. Re-platforming the RDBMS at the same time as rewriting the app tier would combine two independent risky migrations into one — don't do that unless there's a hosting/licensing reason (there isn't one described here).

---

## 1. Target architecture

```
┌────────────────────────┐        HTTPS + JSON        ┌──────────────────────────────┐
│  Next.js (frontend)    │ ───────────────────────────▶│  ASP.NET Core Web API         │
│  App Router, RSC,      │◀─────────────────────────── │  (.NET 8 LTS)                 │
│  shadcn/ui, TanStack Q  │        JWT bearer            │                                │
└────────────────────────┘                              │  Controllers → Application     │
                                                         │  Services → Domain → EF Core   │
                                                         │  (Npgsql provider)              │
                                                         └───────────────┬────────────────┘
                                                                         │
                                                                 ┌───────▼────────┐
                                                                 │  PostgreSQL     │
                                                                 │  (same schema,  │
                                                                 │  RLS/triggers   │
                                                                 │  removed)       │
                                                                 └────────────────┘
```

Key decisions:

- **Next.js becomes a pure BFF/frontend.** `app/api/*` Route Handlers are deleted (or reduced to thin passthrough proxies during transition) — this matches `rule.md §4`'s own stated goal: *"Services return plain objects / arrays, not `NextResponse`, so the same logic can be wrapped by another transport later."* We are exercising exactly that escape hatch.
- **Auth moves from Supabase Auth (cookie session) to the .NET API issuing JWTs.** Next.js stores the access/refresh token in an `httpOnly` cookie set by a thin `/api/auth/*` proxy route (keeps XSS posture identical to today), and every other Next.js Route Handler is deleted — direct browser → .NET calls are **not** used for anything that needs the tenant/session cookie, to avoid CORS+cookie complexity; the Next.js layer forwards the bearer token server-side.
- **RLS/triggers/DB functions are decompiled into C# services**, described domain-by-domain in §6.
- **Multi-tenancy** becomes an EF Core **global query filter** on `TenantId` (set from the JWT claim per-request via `IHttpContextAccessor`/scoped `ITenantContext`), not a Postgres session variable. Branch scoping is a second, composable filter.
- **CSRF disappears** for the .NET API itself (bearer-token APIs are not CSRF-vulnerable), but the Next.js **proxy** layer that sets the auth cookie still needs CSRF protection on its own mutation routes, same pattern as today.

---

## 2. Solution structure (.NET side)

```
PharmaCare.sln
src/
  PharmaCare.Api/                 # ASP.NET Core host: controllers, DI wiring, middleware, Program.cs
    Controllers/{Domain}Controller.cs
    Middleware/TenantResolutionMiddleware.cs
    Middleware/ExceptionHandlingMiddleware.cs
    Filters/RequireRoleAttribute.cs
    Program.cs

  PharmaCare.Application/         # use-case services (1:1 with lib/server/services/*)
    Sales/SalesService.cs, SaleValidators.cs, Dtos/
    Purchases/...
    Accounting/VoucherPostingService.cs, TrialBalanceService.cs, ...
    Inventory/StockDeductionService.cs (FEFO), BatchExpiryService.cs
    Suppliers/, Customers/, Prescriptions/, CashShifts/, Consignment/, Reports/, Tenancy/, Users/
    Common/PagedResult.cs, Common/ApiError.cs, Common/Result.cs

  PharmaCare.Domain/               # entities, enums, value objects, domain invariants
    Entities/{Sale,SaleItem,Medicine,MedicineBatch,AccountingAccount,AccountingVoucher,...}.cs
    Enums/
    Exceptions/DomainException.cs

  PharmaCare.Infrastructure/       # EF Core DbContext, repositories, Npgsql, migrations
    PharmaDbContext.cs
    Migrations/                    # EF Core migrations mirroring scripts/*.sql history
    Repositories/
    Auth/JwtTokenService.cs, PasswordHasher.cs
    Tenancy/TenantContext.cs

tests/
  PharmaCare.Application.Tests/    # unit tests per service (xUnit + FluentAssertions)
  PharmaCare.Integration.Tests/    # Testcontainers Postgres, ports scripts/*db-hardening* tests
```

Cross-cutting libraries: **FluentValidation** (mirrors the Zod schemas), **MediatR** is optional — given 40 services with clear CRUD+workflow shapes, plain constructor-injected application services are simpler to review than a full CQRS/mediator layer; don't add MediatR unless a specific service's branching complexity earns it.

---

## 3. API contract standard (applies to every endpoint)

To keep the frontend migration mechanical, the .NET API mirrors the *existing* Next.js API conventions rather than inventing new ones.

**Base URL / versioning:** `/api/v1/{domain}` — versioned from day one (the current app treats this as optional; the new one should not, since a second consumer — the .NET API — now exists independently of the frontend release cycle).

**Auth:** `Authorization: Bearer <jwt>`. Claims: `sub` (user id), `tenant_id`, `branch_id` (nullable — superadmin/tenant-wide roles), `role`, `exp`. Refresh via `POST /api/v1/auth/refresh` with the refresh token (rotated, stored hashed).

**Success envelope** (matches current `successResponse` helper):
```json
{ "data": { ... }, "meta": null }
```
List endpoints:
```json
{ "data": [ ... ], "meta": { "page": 1, "limit": 20, "total": 137, "totalPages": 7 } }
```

**Error envelope** (uniform across all controllers, produced by global exception middleware):
```json
{ "error": { "code": "VALIDATION_ERROR", "message": "...", "details": [ { "field": "quantity", "message": "must be > 0" } ] } }
```
Standard `code` values: `VALIDATION_ERROR` (400), `UNAUTHENTICATED` (401), `FORBIDDEN` (403), `NOT_FOUND` (404), `CONFLICT` (409 — e.g. voucher already posted, insufficient stock), `RATE_LIMITED` (429), `INTERNAL` (500).

**Pagination params:** `page` (1-based), `limit` (default 20, max 100), plus domain filters (`search`, `status`, `dateFrom`, `dateTo`, `branchId`). List endpoints that back dashboards must support `sort` + `order`.

**Idempotency:** Mutating endpoints for money/stock flows (sale creation, purchase receipt, voucher post) require an `Idempotency-Key` header, stored per-tenant with the response hash — ports the existing `sales-idempotency-key` migration (script 72) concept out of the DB and into a request-level guard, backed by a small `idempotency_keys` table (tenant_id, key, endpoint, response_hash, created_at, UNIQUE(tenant_id, key, endpoint)).

**Optimistic concurrency:** entities with a `RowVersion`/`xmin`-style token returned in `ETag`; mutating with a stale token → `409 CONFLICT`. Apply to: medicines, accounting_accounts, settings, tenant config — anything editable concurrently by two staff.

---

## 4. Domain inventory → .NET module map

Derived from the 40 files in `lib/server/services/*` and 126 route files in `app/api/**`.

| Domain | Current service | New Application module | Notes |
|---|---|---|---|
| Auth/session | `app/api/auth/*`, Supabase Auth | `Application.Auth` | Full rewrite — see §7 |
| Tenants/Branches | `tenant-service`, `tenant-branch-service` | `Application.Tenancy` | Superadmin CRUD, `branch-context` |
| Users | `user-service`, `superadmin-service` | `Application.Users` | Invite flow, password reset, RBAC |
| Medicines/Catalog | `medicine-service`, `medicine-catalog-service`, `price-history-service` | `Application.Catalog` | Batches, recall, archive, similar-names dedupe |
| Inventory | `inventory-transaction-service`, `inventory-supplier-receipt-service` | `Application.Inventory` | FEFO deduction, expired-batch handling, dispose |
| Stock transfers | `stock-transfer-service` | `Application.Inventory.Transfers` | In-transit state machine |
| Purchases | `purchase-service` | `Application.Purchasing` | Approve/receive/cancel, direct receipts, reorder suggestions |
| Sales | `sales-service` | `Application.Sales` | Voucher auto-post on sale, cancellation (script 93), idempotency |
| Refunds / Returns | `refunds-service`, `returns-service` | `Application.Sales.Returns` | Integrity rules from script 68 |
| Prescriptions | `prescriptions-service` | `Application.Prescriptions` | Refill due tracking, sale-time enforcement (script 76) |
| Accounting/GL | `accounting-service` | `Application.Accounting` | Chart of accounts, vouchers, 12 report endpoints — **highest scrutiny module**, see §6.1 |
| Suppliers | `supplier-service`, `supplier-ledger-service`, `supplier-payment-service`, `supplier-return-service`, `supplier-cost-history-service`, `supplier-statement` | `Application.Suppliers` | AP subledger (script 56/57) |
| Customers | `customer-service`, `customer-ledger-service`, `customer-payment-service` | `Application.Customers` | AR subledger (script 63) |
| Cash shifts | `cash-shift-service` | `Application.CashShifts` | Open/close/summary |
| Consignment | `consignment-service` | `Application.Consignment` | Positions, settlements, receive |
| Bank | `bank-deposit-service`, `bank-reconciliation-service` | `Application.Banking` | Auto-match + reconciliation lines |
| Expenses | `expense-service` | `Application.Expenses` | |
| Categories/Settings | `category-service`, `settings-service` | `Application.Reference` | |
| Notifications | `notification-service` | `Application.Notifications` | Dashboard counts (script 75 RPC → C# query) |
| Reports | `reports-service`, `dashboard-page-service` | `Application.Reporting` | Trial balance, GL, balance sheet, P&L, AR/AP aging, GL reconciliation, cash movement, VAT return, dead-stock, compliance, DDA/narcotic |
| Migration wizard | `migration-service` | `Application.OnboardingMigration` | Opening balances (script 99) — **only needed for existing-customer onboarding; not needed for the .NET cutover itself**, see §9 |
| System | `system-diagnostics-service` | `Application.System` | health checks |

---

## 5. Data model (EF Core, mirrors existing Postgres schema)

The schema itself does **not** need to change shape — only where the *logic* around it lives. EF Core maps onto the existing tables (or a cleaned-up 1:1 rebuild, see §9 rollout options). Core entities, grounded in the actual migrations read from `scripts/`:

**Accounting (scripts 51, 53, 55–58, 64, 65, 70, 81, 87, 91)**
```
AccountingAccount        (Id, TenantId, Code, Name, AccountType enum[asset|liability|equity|revenue|expense], IsSystem, IsActive)
AccountingVoucherSequence(TenantId PK, LastNumber)      -- becomes a DB sequence or a serializable-isolation increment in C#
AccountingVoucher        (Id, TenantId, BranchId, VoucherNo, VoucherDate, VoucherType[journal|system_sale|...], Source[manual|system],
                          ReferenceType, ReferenceId, Status[draft|posted|void], Narration, CreatedBy, CreatedAt, PostedAt, PostedBy)
AccountingVoucherLine    (Id, TenantId, VoucherId, LineNo, AccountId, Description, DebitAmount, CreditAmount)
```
DB-level invariants to re-home in C#:
- **Balanced voucher constraint** (script 70, `accounting_check_voucher_balance()` trigger) → `VoucherPostingService.Post()` must sum debits == sum credits inside the same DB transaction before flipping `Status → posted`, and this must also be re-asserted as a Postgres `CHECK`/deferred constraint trigger kept **only** as a last-resort safety net (belt-and-suspenders), not as the primary enforcement point.
- **One posted voucher per sale** (`ux_accounting_voucher_sale_posted` partial unique index) → keep as a DB unique index (this is *data integrity*, not business logic — fine to leave in Postgres) plus an app-level idempotency check before insert.
- **Posting-lock ordering** (scripts 69, 97) — was a race-condition fix for concurrent posts; in C# this becomes a `SELECT ... FOR UPDATE` inside the transaction or a serializable transaction scope around `VoucherPostingService.Post()`.

**Inventory / Batches (scripts 77, 85, 95, 96, 103)**
```
Medicine        (Id, TenantId, Name, GenericName, CategoryId, ReorderLevel, IsArchived, ...)
MedicineBatch   (Id, TenantId, MedicineId, BranchId, BatchNo, ExpiryDate, QuantityOnHand, CostPrice, SellingPrice, RackLocation)
InventoryTransaction (Id, TenantId, BranchId, MedicineBatchId, Type[purchase|sale|adjustment|transfer|dispose|...], Quantity, ReferenceType, ReferenceId, CreatedAt)
```
FEFO (first-expired-first-out) deduction, currently likely a Postgres function selecting batches ordered by `expiry_date ASC`, moves to `StockDeductionService.DeductForSale(medicineId, qty)`: loads batches within the same transaction with `FOR UPDATE`, deducts oldest-expiry-first, raises `InsufficientStockException` → `409 CONFLICT` if unmet.

**Multi-tenant/branch scoping (scripts 30, 36, 45, 62, 66, 67, 82, 98)** — becomes:
```csharp
modelBuilder.Entity<Sale>().HasQueryFilter(s => s.TenantId == _tenantContext.TenantId);
```
applied globally per entity in `PharmaDbContext.OnModelCreating`, with a **separate, explicit** `IgnoreQueryFilters()` escape hatch reserved for the superadmin role only, gated by an attribute-level authorization check — not by a bypass RLS policy nobody can see at review time. This is a net legibility improvement: today "who can see what" is spread across 8 separate RLS-hardening migrations; in C# it is one filter + one attribute.

---

## 6. Business-logic migration — high-risk modules in detail

### 6.1 Accounting / GL (highest scrutiny)

Current auto-posting (script 53, "accounting-auto-vouchers-all-flows") fires vouchers from triggers on `sales`, `purchases`, `supplier_payments`, `customer_payments`, `refunds`, `returns`, `expenses`. Each of those becomes an explicit call from the corresponding Application service, e.g.:

```csharp
// Application.Sales.SalesService.CreateSaleAsync
using var tx = await _db.Database.BeginTransactionAsync(IsolationLevel.Serializable);
var sale = ... // insert sale + items, deduct stock via StockDeductionService
await _voucherPosting.PostSystemVoucherAsync(new VoucherRequest {
    VoucherType = VoucherType.SystemSale,
    ReferenceType = "sale", ReferenceId = sale.Id,
    Lines = _coaMapper.MapSale(sale)   // deterministic account mapping — rule.md §9.1
});
await tx.CommitAsync();
```

This satisfies `rule.md §9.1` verbatim in the new stack: **idempotent posting** (idempotency key + unique partial index), **balanced double-entry** (service-level assertion + DB CHECK as backstop), **deterministic account mapping** (`ICoaMapper` per tenant, replacing "backfill-chart-of-accounts" script 81 logic), and **no direct edits to posted vouchers from UI** (controller exposes only `Void`/`Reverse`, never `Update`, on a posted voucher — enforced by `VoucherStatus` guard clause, not by hiding a button).

Reports (`reports/trial-balance`, `general-ledger`, `balance-sheet`, `profit-loss`, `ar-aging`, `ap-aging`, `ar-gl-reconciliation`, `ap-gl-reconciliation`, `inventory-gl-reconciliation`, `cash-movement`, `vat-return`) port 1:1 as LINQ/Dapper read-queries in `Application.Reporting` — these were almost certainly SQL views/queries already, so this is the most mechanical part of the whole migration.

### 6.2 Prescriptions / dispensing safety (scripts 76, 86)

"Prescription enforcement at sale" and "dispensing safety controls" are DB-trigger-level guards today (e.g. block sale of a scheduled/narcotic medicine without a linked, unexpired prescription). Move to a `IDispensingSafetyPolicy` checked inside `SalesService.CreateSaleAsync` *before* the transaction opens, so a rejected sale never touches inventory or accounting — this is strictly better than a trigger-level rollback (cleaner error message back to the API caller, no wasted transaction).

### 6.3 Tenant/branch/RBAC (scripts 30, 36, 45, 62, 66, 67, 82, 88, 98)

Replace with:
- `TenantResolutionMiddleware` — resolves `TenantId`/`BranchId` from JWT claims into a scoped `ITenantContext`, rejects mismatched `X-Branch-Id` headers.
- `[RequireRole("Owner","Pharmacist")]` action filters (mirrors `lib/security/rbac-types.ts`).
- EF Core global query filters (as above) — this collapses 8 separate hardening migrations' worth of policy sprawl into code that's diffable in one PR and unit-testable without spinning up Postgres.

### 6.4 Audit logging (scripts 71, 92, 94)

`lib/security/audit.ts` → `IAuditLogger` writing to an `audit_logs` table from an ASP.NET Core action filter/interceptor wrapping every mutating endpoint — keep the existing table shape, this is pure plumbing.

---

## 7. Auth & session design (full rewrite — flag this explicitly)

Today: Supabase Auth issues its own session, Next.js middleware refreshes it via cookies, CSRF token guards mutations. There is **no existing .NET-compatible identity system** — this is new work, not a port.

Plan:
1. `users` table gains a `password_hash` (if not already using one under Supabase Auth's own users table — **verify**: Supabase Auth stores users in `auth.users`, separate from the app's `public.users`; migrating off Supabase Auth means **exporting and re-hashing/reset-flowing every existing user's credentials**, since Supabase does not expose password hashes for re-use). Use ASP.NET Core Identity or a minimal custom `IPasswordHasher` (BCrypt/Argon2) + own `JwtTokenService`.
2. **Migration path for existing users:** force a password-reset flow for all tenants during cutover (email link) rather than attempting hash portability — call this out to the user as a hard requirement, not a nice-to-have.
3. Access token (short-lived, 15 min) + refresh token (rotated, httpOnly cookie set by the Next.js proxy, 30 days) — mirrors current UX with a real session length, no silent behavior change for end users.
4. `POST /api/v1/auth/login`, `POST /api/v1/auth/refresh`, `POST /api/v1/auth/logout`, `POST /api/v1/auth/invite-accept`, `POST /api/v1/auth/password-reset/request`, `POST /api/v1/auth/password-reset/confirm`.
5. Superadmin tenant-impersonation (`superadmin/tenant-users`, password-reset-by-superadmin routes) ports to a scoped, audited "act-as" claim rather than a raw password reset by an admin — tighten this during the rewrite since it's a natural point to raise the security bar, not just port it as-is.

---

## 8. Validation strategy (FluentValidation ⟷ Zod parity)

Only 5 dedicated Zod schema files exist today (`tenants`, `branches`, `categories`, `settings`, `accounting`); most validation is inline `z.object(...)` inside route handlers. Before/during the port:

1. **Extraction pass (do this first, in the current Next.js codebase, before writing any C#):** pull every inline `z.object(...)` out of `app/api/**/route.ts` into named schemas under `lib/server/schemas/{domain}.ts`. This is valuable *independent of the .NET migration* (it's exactly `rule.md §12` step 1) and gives you a **complete, reviewable validation spec** to transliterate into `FluentValidation` validators — instead of reverse-engineering rules from route code while also writing new C#.
2. Each Zod schema → one `AbstractValidator<TDto>` class, colocated as `Application/{Domain}/Validators/{X}Validator.cs`.
3. Cross-field/business rules that aren't pure shape validation (e.g. "voucher lines must balance", "batch quantity can't go negative", "cannot receive more than ordered qty") are **not** FluentValidation rules — they're domain invariants enforced inside the service/transaction, returning `DomainException` → `409 CONFLICT`, matching §6 above. Keep the FluentValidation layer strictly to input shape/format (`400`), and business-rule enforcement in the service layer (`409`) — don't blur the two, since the current codebase's mixture of route-level and DB-level checks is exactly the ambiguity this migration is meant to remove.

---

## 9. Rollout strategy — strangler fig, domain by domain

Do **not** big-bang this. 126 routes and 40 services is multiple months of work with real money/stock correctness on the line; a phased cutover with a rollback switch per domain is non-negotiable.

**Phase 0 — Foundations (1–2 weeks)**
- Stand up `PharmaCare.Api` skeleton: JWT auth, tenant middleware, error envelope, health checks, EF Core pointed at a **read replica / branch of the same Postgres DB** (not prod) for initial development.
- Port `Application.Reference` (categories, settings) and `Application.Tenancy` first — lowest risk, no money/stock, validates the whole pipeline (auth → controller → service → EF Core → response) end-to-end.
- Next.js gets a feature-flag-per-domain (`BACKEND_TARGET_<DOMAIN>=dotnet|nextjs`) inside `lib/api/*` client modules — each domain's `api-client.ts` points at either the old Route Handler or the new .NET base URL, switchable without a frontend deploy (env var + edge config).

**Phase 1 — Read-heavy, low-blast-radius domains**
- Reports, Reporting, Notifications, Dashboard — pure reads, easy to A/B diff against the old Next.js output for correctness before flipping the flag.

**Phase 2 — CRUD-heavy reference data**
- Medicines/Catalog, Suppliers, Customers, Users — writes exist but no double-entry/stock side effects.

**Phase 3 — Inventory + Purchasing**
- Stock transfers, Purchases, Consignment — introduces FEFO/batch correctness; run the old and new paths **in parallel with shadow-writes disabled and result comparison logged** for at least one full business cycle (e.g. 2 weeks) before cutting traffic over.

**Phase 4 — Sales + Accounting (highest risk, cut over last)**
- Sales, Refunds, Returns, Prescriptions, Cash Shifts, Accounting/GL, Banking. Require: full parity test suite (§10), a **freeze on schema changes** in the old Next.js path during this phase, and a rollback plan that can flip the feature flag back within one deploy if a discrepancy is found.

**Phase 5 — Auth cutover**
- Do this **last**, after every domain is served by .NET, because it's the only phase requiring a user-facing action (forced password reset) and touches every other domain's authorization path. Run Supabase Auth and the new JWT issuer side-by-side behind a single `/api/v1/auth/*` facade during transition if a gradual user-by-user cutover is preferred.

**Phase 6 — Decommission**
- Delete `app/api/**/route.ts`, `lib/server/services/*`, Supabase project (or keep Postgres, drop Supabase Auth/RLS/Realtime add-ons), remove `@supabase/*` deps from `package.json`.

**Note on the "migration wizard" domain (`migration-service`, scripts 99/opening-balances):** this feature (onboarding a *pharmacy customer's* existing paper records into opening balances) is orthogonal to the .NET migration and can be ported in whichever phase is convenient — it has no bearing on cutover order for the platform itself.

---

## 10. Testing & parity verification

- **Unit tests** (xUnit) for every Application service — 1:1 against the existing `*.test.ts` files as a checklist of scenarios to preserve, not a literal port (Vitest → xUnit syntax differs, but the *scenarios* — e.g. "cannot post an unbalanced voucher", "cannot receive negative quantity" — must all have a C# equivalent).
- **Integration tests** (Testcontainers.PostgreSql) directly porting `db-hardening.integration.test.ts` — this file already encodes the DB-level invariants (balance constraints, unique posted-voucher index, RLS-adjacent checks) that are being *removed* from the DB and re-homed in C#; it is the single most important test file to not lose fidelity on.
- **Contract/parity tests during rollout**: for each domain in Phase 1–4, a script that calls both the legacy Next.js endpoint and the new .NET endpoint with identical inputs (staging data) and diffs the JSON response shape + key financial totals. Automate this per-domain before flipping its feature flag.
- **Load test** the Accounting and Sales modules specifically for the serializable-transaction/`FOR UPDATE` locking introduced in §6.1/§6.2 — this is the part most likely to regress throughput vs. the original trigger-based approach under concurrent checkout load.

---

## 11. Risk register

| Risk | Impact | Mitigation |
|---|---|---|
| Password hash portability from Supabase Auth | Cannot log any existing user in post-cutover without action | Forced reset flow (§7), communicated to tenants in advance |
| RLS/trigger logic silently under-ported (a rule only enforced in a migration nobody re-read) | Data corruption / tenant data leak | Full read of all 60 files with `CREATE POLICY/FUNCTION/TRIGGER` before Phase 3/4 sign-off; each must map to a named C# guard with a test |
| Concurrent voucher posting race | Double-posted or unbalanced GL | Serializable transaction + `FOR UPDATE`, load-tested (§10) |
| FEFO/stock deduction race under concurrent sales | Overselling / negative stock | Row-level locking in `StockDeductionService`, integration-tested |
| Feature-flag drift (old and new paths diverge silently mid-rollout) | Inconsistent behavior per domain during transition | Parity tests gate every flag flip (§10); freeze schema changes on the legacy path once a domain enters Phase 3/4 |
| Superadmin "act-as" / password reset power | Privilege escalation surface | Tighten to scoped, audited action during rewrite (§7.5), don't just port as-is |
| Scope: `features/**/api-client.ts` still doing direct `createClient()` calls | Some UI paths bypass the API layer entirely, invisible to this migration | Grep-verify (flagged as unresolved by the inventory pass) before Phase 0 sign-off |

---

## 12. Representative endpoint specification (Sales domain, as the template for the rest)

The remaining ~120 endpoints follow the same shape; write the equivalent table for each domain during Phase 0–4 planning rather than up front for all of them, since detail here is only useful once you're actually building that domain.

| Method | Path | Auth | Request | Response | Validation | Notes |
|---|---|---|---|---|---|---|
| `POST` | `/api/v1/sales` | Bearer, role ∈ {Owner,Pharmacist,Cashier} | `CreateSaleRequest{ customerId?, branchId, items[]{medicineBatchId,qty,unitPrice,discount}, paymentMethod, paymentAmount, notes? }` + `Idempotency-Key` header | `201 { data: SaleDto }` | qty>0 per item, ≥1 item, paymentAmount ≥ total if not credit | Deducts stock (FEFO), auto-posts system voucher, enforces prescription rule (§6.2), all in one serializable transaction |
| `GET` | `/api/v1/sales` | Bearer | query: `page,limit,search,dateFrom,dateTo,branchId,status` | `200 { data: SaleDto[], meta }` | — | |
| `GET` | `/api/v1/sales/{id}` | Bearer | — | `200 { data: SaleDto }` | — | 404 if wrong tenant (query filter) |
| `GET` | `/api/v1/sales/stats` | Bearer | query: `dateFrom,dateTo,branchId` | `200 { data: SalesStatsDto }` | — | |
| `POST` | `/api/v1/sales/{id}/cancel` | Bearer, role ∈ {Owner,Pharmacist} | `{ reason }` | `200 { data: SaleDto }` | reason required, sale not already cancelled/refunded | Reverses voucher (script 93 logic), restores stock |

`SaleDto`, `SalesStatsDto` etc. are defined once in `Application.Sales.Dtos` and reused by the controller — never let the controller shape its own ad hoc anonymous object, since that's exactly the drift that makes a frontend contract fragile across 126 endpoints.

---

## 13. Immediate next steps (actionable, in order)

1. Run the grep flagged in §11's last risk row (`createClient` inside `features/**/api-client.ts` and `lib/api/**`) to close the one open unknown from the inventory pass.
2. Do the Zod-extraction pass (§8.1) on the current Next.js codebase — pure win, needed either way, and turns "read 126 route files to find validation rules" into "read 40-ish schema files."
3. Read all 60 SQL files containing `CREATE POLICY/FUNCTION/TRIGGER` and produce a one-row-per-rule table (rule → source file → target C# class) — this is the actual hard deliverable of Phase 0 and should exist as a tracked checklist before any Phase 3/4 work starts.
4. Stand up `PharmaCare.Api` skeleton (Phase 0) against a **non-production** branch of the Postgres DB.
5. Pick and build the first real domain end-to-end (recommend `Application.Reference` — categories/settings) to validate the whole pipeline before touching anything with money in it.

---

## 14. Full execution checklist (task-by-task, per phase)

This is the granular work breakdown behind §9's phase summary — one row per concrete deliverable, in dependency order. Track it as issues/sub-issues in whatever tracker the team uses; the numbering here (`P0-1`, `P1-3`, ...) is a stable ID scheme for cross-referencing from PRs and standups, not a mandate to use this exact tool. Re-verify each domain's actual file list against the repo at the start of its phase — this document was grounded in a 2026-09-09 snapshot and the codebase moves.

### Phase 0 — Foundations

**Discovery / spec (blocking — do before any C# is written)**
- [ ] `P0-1` Grep `createClient` in `features/**/api-client.ts` and `lib/api/**`; for every hit, record whether it's a legit direct-Supabase read (e.g. Realtime subscription) or an API-layer bypass that needs its own route before the .NET cutover can cover it (§11 last risk row).
- [ ] `P0-2` Zod-extraction pass: move every inline `z.object(...)` out of `app/api/**/route.ts` into `lib/server/schemas/{domain}.ts`. Land as its own Next.js PR, independent of anything .NET.
- [ ] `P0-3` Read all 60 SQL files matching `CREATE POLICY|FUNCTION|TRIGGER`; produce `docs/dotnet-rule-inventory.csv` with columns `rule, source_file, migration_script_no, target_c#_class, target_test, status`. This is the Phase 3/4 sign-off gate — do not start Phase 3 until every row has a non-empty `target_c#_class`.
- [ ] `P0-4` Enumerate all 126 `app/api/**/route.ts` files into `docs/dotnet-route-inventory.csv` (`method, path, current_service, target_controller, target_application_module, has_inline_zod, notes`) — this is the master checklist §12's per-domain endpoint tables get filled in from.
- [ ] `P0-5` Confirm the Postgres re-platform decision (§0: **keep Postgres, do not move to SQL Server**) is signed off by whoever owns infra cost/hosting, since it affects Phase 0 provisioning.

**Solution scaffold**
- [ ] `P0-6` Create `PharmaCare.sln` and the five projects under `src/` per §2 (`Api`, `Application`, `Domain`, `Infrastructure`, plus `tests/*.Tests`). Pin to **.NET 8 LTS**.
- [ ] `P0-7` Add `Npgsql.EntityFrameworkCore.PostgreSQL`, `FluentValidation.AspNetCore`, `xUnit`, `FluentAssertions`, `Testcontainers.PostgreSql` package references.
- [ ] `P0-8` `PharmaDbContext` scaffolded via `dotnet ef dbcontext scaffold` against a **non-production branch** of the existing Postgres DB (never point Phase 0 dev work at prod) — confirms the schema maps cleanly before any hand-written entities are added.
- [ ] `P0-9` Implement `ITenantContext` (scoped, populated from JWT claims) and wire the global query filter pattern from §5 on at least one entity as a spike, to prove the pattern before applying it to all ~40 entity types.
- [ ] `P0-10` `TenantResolutionMiddleware` — resolve `tenant_id`/`branch_id` claims, reject mismatched `X-Branch-Id` header, short-circuit with `401`/`403` per §3.
- [ ] `P0-11` `ExceptionHandlingMiddleware` — maps `DomainException` → `409`, `ValidationException` → `400`, unhandled → `500`, all wrapped in the `{ "error": {...} }` envelope from §3.
- [ ] `P0-12` `RequireRoleAttribute` action filter mirroring `lib/security/rbac-types.ts` role enum.
- [ ] `P0-13` Idempotency-key middleware/attribute: reads `Idempotency-Key` header, checks/writes the `idempotency_keys` table (§3) before/after the action executes.
- [ ] `P0-14` Health check endpoint (`/health` or `/api/v1/system/health`) — port of `system-diagnostics-service`.
- [ ] `P0-15` Wire up Serilog (or equivalent) structured logging + request correlation id, since every later phase's parity testing depends on being able to trace a request through both stacks.
- [ ] `P0-16` CI pipeline: `dotnet build` + `dotnet test` on PR, mirroring whatever the Next.js repo already runs for its own tests.

**First real domain (validates the whole pipeline end-to-end)**
- [ ] `P0-17` `Application.Reference` (categories, settings): entities, `AbstractValidator`s ported from the 5 existing Zod schema files, service, controller, xUnit tests ported from the existing `*.test.ts` scenarios.
- [ ] `P0-18` `Application.Tenancy` (tenant/branch CRUD, superadmin-only): same shape as P0-17.
- [ ] `P0-19` Add the `BACKEND_TARGET_<DOMAIN>` feature flag plumbing in `lib/api/*` client modules on the Next.js side — build it against these two low-risk domains first so the switch mechanism itself is proven before Phase 1.
- [ ] `P0-20` Flip `BACKEND_TARGET_REFERENCE` and `BACKEND_TARGET_TENANCY` to `dotnet` in a staging environment; smoke-test manually.

### Phase 1 — Read-heavy, low-blast-radius domains

- [ ] `P1-1` `Application.Reporting`: port `trial-balance`, `general-ledger`, `balance-sheet`, `profit-loss`, `ar-aging`, `ap-aging`, `ar-gl-reconciliation`, `ap-gl-reconciliation`, `inventory-gl-reconciliation`, `cash-movement`, `vat-return` as Dapper/LINQ read queries (§6.1 — flagged as the most mechanical part of the whole migration).
- [ ] `P1-2` `Application.Notifications` — port script-75 RPC dashboard-count logic to a C# query.
- [ ] `P1-3` Dashboard-page read endpoints (`dashboard-page-service`).
- [ ] `P1-4` Write the parity-diff script (§10) once, generically enough to reuse for every later domain: calls old + new endpoint with identical staging inputs, diffs JSON shape and (for reports) key financial totals; fail the flag-flip if any diff.
- [ ] `P1-5` Run parity diff across all Phase 1 endpoints for at least a few days of staging traffic before flipping flags.
- [ ] `P1-6` Flip `BACKEND_TARGET_REPORTING` / `BACKEND_TARGET_NOTIFICATIONS` to `dotnet`; monitor error rates for a full business day before calling the phase done.

### Phase 2 — CRUD-heavy reference data

- [ ] `P2-1` `Application.Catalog` (medicines, batches, recall, archive, similar-names dedupe) — entities, validators, service, controller, tests.
- [ ] `P2-2` `Application.Suppliers` (supplier CRUD, ledger, payment, return, cost-history, statement) — this is an AP subledger (script 56/57); port the ledger-balance invariants as domain-service logic, not just CRUD.
- [ ] `P2-3` `Application.Customers` (customer CRUD, ledger, payment) — AR subledger (script 63), same pattern as P2-2.
- [ ] `P2-4` `Application.Users` (invite flow, password reset request, RBAC assignment) — **note:** actual login/session issuance stays out of scope until Phase 5; this is just user CRUD/admin operations.
- [ ] `P2-5` Optimistic concurrency (`RowVersion`/`ETag`, §3) implemented on medicines, accounting_accounts, settings, tenant config — do this here since Catalog is the first domain in the list that needs it.
- [ ] `P2-6` Parity diff + flag flip per sub-domain (Catalog, Suppliers, Customers, Users), same gate as P1-5/6.

### Phase 3 — Inventory + Purchasing (first phase with money/stock correctness)

- [ ] `P3-1` `StockDeductionService.DeductForSale` — FEFO batch deduction, row-locked (`FOR UPDATE`) within the sale transaction, throws `InsufficientStockException` on shortfall (§5).
- [ ] `P3-2` `Application.Inventory` — inventory-transaction-service, supplier-receipt-service port; `Application.Inventory.Transfers` — in-transit state machine for stock transfers.
- [ ] `P3-3` `Application.Purchasing` — approve/receive/cancel workflow, direct receipts, reorder suggestions.
- [ ] `P3-4` `Application.Consignment` — positions, settlements, receive.
- [ ] `P3-5` Integration tests (Testcontainers.PostgreSql) covering concurrent-sale-vs-concurrent-purchase races against the same batch, proving the row-locking actually prevents overselling (§10, §11 FEFO risk row).
- [ ] `P3-6` **Shadow-write period:** run old (Next.js/Postgres-trigger) and new (.NET) paths in parallel with writes still going through the legacy path, comparing computed results (not committing new-path writes) for at least one full business cycle (~2 weeks) per §9 Phase 3.
- [ ] `P3-7` Sign off `docs/dotnet-rule-inventory.csv` rows for every inventory/purchasing-related trigger/function/policy (script list from §5 Inventory/Batches section) before flipping any Phase 3 flag to live-write.
- [ ] `P3-8` Flip `BACKEND_TARGET_INVENTORY` / `PURCHASING` / `CONSIGNMENT` to `dotnet` for real (write) traffic; keep the legacy path's schema frozen (§9) during the cutover window.

### Phase 4 — Sales + Accounting (highest risk, cut over last)

- [ ] `P4-1` `VoucherPostingService.Post()` — balanced double-entry assertion inside the transaction, deterministic `ICoaMapper` per tenant, idempotency-key + unique-partial-index enforcement, `Void`/`Reverse`-only mutation surface on posted vouchers (§6.1).
- [ ] `P4-2` Keep the balanced-voucher Postgres `CHECK`/deferred trigger as a **backstop only** (§5) — do not remove it in Phase 4; removing DB-level safety nets is a Phase 6 decommission task, not a Phase 4 one.
- [ ] `P4-3` `Application.Sales.SalesService.CreateSaleAsync` — serializable transaction wrapping stock deduction (P3-1) + prescription/dispensing-safety check (P4-5, checked *before* the transaction opens) + system-voucher posting (P4-1), per the §12 endpoint spec.
- [ ] `P4-4` `Application.Sales.Returns` (refunds-service, returns-service) — port script-68 integrity rules; sale cancellation ports script-93 voucher-reversal + stock-restore logic.
- [ ] `P4-5` `IDispensingSafetyPolicy` — scheduled/narcotic medicine sale blocked without linked, unexpired prescription (scripts 76, 86); refill-due tracking in `Application.Prescriptions`.
- [ ] `P4-6` `Application.CashShifts` (open/close/summary) and `Application.Banking` (bank-deposit auto-match, bank-reconciliation lines).
- [ ] `P4-7` `Application.Expenses`.
- [ ] `P4-8` `IAuditLogger` action-filter/interceptor wrapping every mutating endpoint in this phase (§6.4) — verify it's actually wired before go-live, since Sales/Accounting is exactly where audit trail gaps matter most.
- [ ] `P4-9` Full parity test suite (§10) green for Sales + Accounting, including the db-hardening.integration.test.ts port (highest-fidelity requirement in the whole plan per §10).
- [ ] `P4-10` Load test the serializable-transaction + `FOR UPDATE` paths in `VoucherPostingService` and `StockDeductionService` under concurrent-checkout simulation; compare throughput against the current trigger-based baseline (§10, §11 concurrent-posting risk row).
- [ ] `P4-11` Freeze schema changes on the legacy Next.js/Postgres path for the duration of this phase (§9).
- [ ] `P4-12` Confirm rollback plan: flag flip back to `nextjs` must be a single deploy, tested in staging by actually flipping it once under simulated load.
- [ ] `P4-13` Sign off remaining `docs/dotnet-rule-inventory.csv` rows (Accounting/GL, prescriptions, cash-shift scripts) — this phase's gate per §11.
- [ ] `P4-14` Flip `BACKEND_TARGET_SALES` / `ACCOUNTING` / `PRESCRIPTIONS` / `CASHSHIFTS` / `BANKING` / `EXPENSES` to `dotnet`, one sub-domain at a time, not all at once, watching error/discrepancy rates between each.

### Phase 5 — Auth cutover (last, user-facing)

- [ ] `P5-1` `password_hash` column + `IPasswordHasher` (BCrypt/Argon2) or ASP.NET Core Identity; `JwtTokenService` issuing short-lived (15 min) access + rotated 30-day refresh tokens (§7).
- [ ] `P5-2` `POST /api/v1/auth/{login,refresh,logout,invite-accept,password-reset/request,password-reset/confirm}`.
- [ ] `P5-3` Next.js `/api/auth/*` proxy: sets/reads the httpOnly refresh cookie, forwards bearer token server-side to the .NET API, keeps CSRF protection on its own mutation routes (§1, §7.3).
- [ ] `P5-4` Superadmin "act-as" — scoped, audited claim replacing raw password-reset-by-admin (§7.5); this is a deliberate security-bar raise, not a straight port — get explicit sign-off that the tightened behavior is acceptable before shipping.
- [ ] `P5-5` Forced password-reset flow (email link) for all existing users — build and test the email delivery path, since Supabase Auth password hashes are not portable (§7.1–2).
- [ ] `P5-6` Tenant communication plan: notify all tenants of the forced-reset requirement before cutover, with a concrete date.
- [ ] `P5-7` Optional: run Supabase Auth and the new JWT issuer side-by-side behind one `/api/v1/auth/*` facade if a gradual per-user cutover is preferred over a hard flag flip (§7 closing note).
- [ ] `P5-8` Cut over auth; monitor login failure rate closely for the first 24–48 hours since this is the one phase that can lock out every user simultaneously if something's wrong.

### Phase 6 — Decommission

- [ ] `P6-1` Delete `app/api/**/route.ts` and `lib/server/services/*` once every domain has been on `dotnet` in production for a burn-in period the team is comfortable with (not immediately after the last flag flip).
- [ ] `P6-2` Remove the now-redundant Postgres RLS policies/triggers/`SECURITY DEFINER` functions that were re-homed in C# — cross-check against `docs/dotnet-rule-inventory.csv` to confirm every row has a shipped, tested C# equivalent before dropping its DB-level source.
- [ ] `P6-3` Drop the balanced-voucher backstop `CHECK`/trigger from P4-2 only now, once Phase 4 has run long enough in production to trust the C# enforcement alone — or keep it permanently as belt-and-suspenders if the team prefers (§5 explicitly allows this).
- [ ] `P6-4` Decommission Supabase Auth/RLS/Realtime add-ons (keep the underlying Postgres instance per §0's recommendation); remove `@supabase/*` deps from `package.json`.
- [ ] `P6-5` Remove the `BACKEND_TARGET_<DOMAIN>` feature-flag machinery from `lib/api/*` once every domain is permanently on `dotnet` and no rollback path is needed.
- [ ] `P6-6` Archive/close out `docs/dotnet-rule-inventory.csv` and `docs/dotnet-route-inventory.csv` as historical record of what moved where.

### Cross-cutting (spans every phase — track once, apply per-domain as each phase touches it)

- [ ] `X-1` Migration wizard domain (`Application.OnboardingMigration`, opening-balances/script 99) — port whenever convenient; explicitly **not** on the critical path for any phase above (§9 closing note).
- [ ] `X-2` Keep `docs/dotnet-route-inventory.csv` and `docs/dotnet-rule-inventory.csv` updated as living documents throughout — they are the actual audit trail a security/compliance review would ask for at the end of this migration.
- [ ] `X-3` For every domain, write its own `§12`-style endpoint table (method/path/auth/request/response/validation/notes) *when that domain's phase starts*, not up front (§12 explicit guidance).
- [ ] `X-4` Per-domain xUnit test coverage checklist: every scenario present in the domain's existing `*.test.ts` file must have a named C# equivalent before that domain's flag flips to `dotnet` (§10).

# PharmaCare on FSH Starter Kit — implementation plan

**Scope of this document:** build all pharmacy business APIs and logic *inside this repo*
(`backend/dotnet-starter-kit`), as new modules following its existing Vertical Slice
Architecture, conventions in `AGENTS.md` / `.agents/rules/*.md`. The Next.js `/api/**`
route cutover (`docs/dotnet-migration-plan.md` at the repo root) is a **later, separate
step** — this plan only covers standing up the .NET side correctly. Ground truth for
"what already exists" was read from `.agents/rules/*.md` and `.agents/skills/add-module/SKILL.md`
on 2026-09-09.

---

## 0. Implementation status

| Module | Status | Notes |
|---|---|---|
| `Reference` | ✅ Built | Categories (tree/soft-delete/restore/trash), Settings. Migration applied. |
| `Suppliers` | ✅ Built | CRUD + AP ledger. `ISupplierLedgerService.RecordPurchaseAsync` added for Purchasing. |
| `Customers` | ✅ Built | CRUD + AR ledger. |
| `Accounting` | ✅ Built | Chart of accounts, voucher post/void engine, Trial Balance report. `IVoucherPostingService`, `IAccountingAccountResolver` cross-module surface. |
| `Inventory` | ✅ Built | Medicines, batches, FEFO deduction/restock, reorder/expiring-batch reports. `IStockDeductionService`, `IStockReceiptService`, `IControlledMedicineChecker` cross-module surface. |
| `Purchasing` | ✅ Built | PurchaseOrder Draft→Approved→Received\|Cancelled. `ReceivePurchaseOrder` commits locally then drives Inventory (pre-commit, synchronous) + Suppliers/Accounting (via `PurchaseOrderReceivedIntegrationEvent`, §2.2). |
| `Prescriptions` | ✅ Built | Prescription + items, refill tracking, `IDispensingSafetyPolicy` cross-module surface, refills-due report. Added `Medicine.IsControlled` to Inventory to support it. Consumes `SaleCompletedIntegrationEvent` for refill bookkeeping. |
| `Sales` | ✅ Built | `CreateSale`/`CancelSale` commit locally then drive Prescriptions/Inventory/Accounting/Customers via integration events (§2.2). Credit sales, CashShifts, VAT all supported. |
| SPIKE-0 (cross-module ambient transaction proof) | ✅ **Run for real, verdict in** | `Testcontainers.PostgreSql` is still blocked by the SSH.NET/audit issue, so the test was rewired to point at a plain `docker run postgres:16-alpine` container instead (no Testcontainers dependency needed — see the test file's top comment). Result below. |
| Cross-module orchestration atomicity | ✅ **Resolved — Outbox/Inbox saga, not the BuildingBlocks ambient-transaction holder** | See §2.2: the shared-`DbConnection`/manual-transaction-passthrough mechanism SPIKE-0 proved (§2.1) was **not** adopted, specifically because this module set is expected to be split into microservices later and that mechanism cannot survive a module getting its own database. All five orchestration handlers (Sales create/cancel, Purchasing receipt, Suppliers/Customers payments) were retrofitted onto commit-then-publish integration events instead — zero `BuildingBlocks/Persistence` changes needed. |
| Onboarding (opening balances) | ✅ Built | `CompleteOnboardingCommand` posts one balanced opening-balance voucher; see §4.8. |
| Build/test verification | ✅ Resolved | The machine's .NET SDK workload manifest inconsistency (an orphaned `mono.toolchain.net7\10.0.111` manifest folder with no matching `emscripten.net7\10.0.111`) was fixed. All modules build clean again. |

**What "done" means above:** code complete, wired into all four module-registration
points, EF migration generated, and — until the SDK issue above — verified via
`dotnet build` (0 warnings, `TreatWarningsAsErrors`) and `Architecture.Tests` (module
boundaries, tenant isolation, handler/validator pairing, endpoint naming). It does
**not** mean integration-tested against a real Postgres instance — that's gated on
Docker/SPIKE-0 the same as everything else needing a live DB.

---

## 1. Why this changes the earlier plan a lot

`docs/dotnet-migration-plan.md` (repo root) was written assuming a bare ASP.NET Core Web
API built from scratch. This starter kit already solves most of that plan's §7 ("full
rewrite, flag this explicitly") and its cross-cutting infra:

| Old plan assumed we'd build | Already exists here | Where |
|---|---|---|
| JWT issuance, refresh rotation, password hashing | `Modules.Identity` — full JWT + ASP.NET Identity, sessions, 2FA, impersonation | `modules/identity.md` |
| Roles/permissions system | `PermissionConstants` + `.RequirePermission()` + `RequiredPermissionAttribute` | `api-conventions.md`, `modules/identity.md` |
| `TenantResolutionMiddleware`, EF global query filter | `BaseDbContext` auto tenant filter + Finbuckle | `database.md`, `modules/multitenancy.md` |
| Custom `idempotency_keys` table + header guard | `.WithIdempotency()` endpoint extension, Redis-backed | `security.md` |
| Audit logging action filter | `Modules.Auditing` | rules index |
| Error envelope / global exception middleware | Global handler → RFC 9457 `ProblemDetails` | `api-conventions.md` |
| Rate limiting, CORS, security headers | Already wired in `UseHeroPlatform` | `security.md` |
| Outbox for cross-module async effects (dashboard notification counts, etc.) | `IOutboxWriter` / integration events / `Modules.Notifications` | `eventing.md` |

**What's actually net-new work:** the pharmacy domain itself — Inventory, Purchasing,
Suppliers, Customers, Prescriptions, Accounting/GL, Sales, Banking, Expenses,
Consignment, Reference data — as new bounded-context modules, using the existing
Identity/Multitenancy/Auditing/Notifications/Files modules as-is. `Modules.Billing`,
`Modules.Chat`, `Modules.Tickets`, `Modules.Webhooks` from the starter kit are **not**
part of the pharmacy domain — leave them in place (unused) unless a later requirement
repurposes one (e.g. Tickets' state-machine pattern is a decent template, not something
to keep running).

This means the old plan's §2 (solution structure), §3 (API contract — bespoke envelope),
§7 (auth rewrite), and most of §11 (risk register) are superseded by this document. Its
§4 (domain inventory), §5 (data model), §6 (business-logic detail), and §10 (testing
philosophy) are still the right source for *what the business rules are* — this plan
maps those rules onto the starter kit's module/feature-folder shape instead of a bespoke
`Application/Domain/Infrastructure` layering.

---

## 2. The one architecture decision that needs to be right before writing any code

**Problem:** `SalesService.CreateSaleAsync` (old plan §6.1/§12) must, in one atomic
transaction: deduct stock FEFO (Inventory), check dispensing safety (Prescriptions),
insert the sale, and post a balanced GL voucher (Accounting). In a single-module design
this is one `DbContext` and one `BeginTransaction`. Here, Inventory/Accounting/Sales are
separate bounded-context modules by the "module = runtime + Contracts, cross-module only
through Contracts" rule (`architecture.md`) — each with its **own** `DbContext**.

**The framework has a documented mechanism for exactly this** (`eventing.md`,
"Atomicity"): `IScopedDbConnectionProvider` gives every `BaseDbContext` in a DI scope the
same underlying `DbConnection`, and `AmbientDbTransactionRegistry` (an interceptor on
*every* Hero context) lets a second context enlist in a transaction the first one opened.
This is what lets the Outbox commit atomically with business writes today — it is a
general framework capability, not an outbox-only hack.

**Decision:** default to **three separate modules** (Inventory, Accounting, Sales) and
rely on the ambient-transaction mechanism for cross-module atomicity, because it matches
this codebase's existing architecture and keeps bounded contexts honest. But this is the
single highest-risk technical assumption in the whole plan (money + stock correctness —
exactly the axis the root-level plan's §11 risk register calls out), so:

- **Task `SPIKE-0` (do this literally first, before any other module code):** write an
  integration test with three throwaway `BaseDbContext`s in one DI scope, each
  `SaveChanges`-ing inside one ambient transaction started via
  `IScopedDbConnectionProvider`; assert that throwing after context #2's save rolls back
  context #1's already-`SaveChanges`d row too. Prove it under `Testcontainers.PostgreSql`,
  not just in-memory.
- **If SPIKE-0 fails or is unreliable** (e.g. Npgsql connection-sharing edge cases,
  isolation-level mismatches under `Serializable`): fall back to merging Sales +
  Inventory + Accounting's *write* paths into a single module (working name
  `Modules.Operations`) with one `DbContext` spanning three Postgres schemas
  (`inventory`, `accounting`, `sales`, each still `HasDefaultSchema`-free per entity
  group via `ToTable(name, schema)`), sacrificing module-boundary purity for
  transactional correctness. Read-only reporting/CRUD for those same domains can still
  live in thinner satellite modules that call the Operations module's `.Contracts`
  query interfaces.
- Either way, **do not start Phase 4 (Sales/Accounting, §6 below) until SPIKE-0's
  verdict is recorded** in this doc.

### 2.1 SPIKE-0 verdict (recorded 2026-09-10, run for real against a live Postgres)

In practice, all eight modules through Sales were built on the sequential-fallback path
*before* SPIKE-0 could actually run (it was blocked on a NuGet audit issue the whole
time — see §0). Once Docker + a plain `docker run postgres:16-alpine` container
(bypassing the blocked `Testcontainers.PostgreSql` package entirely — see
`src/Tests/CrossModuleTransaction.Tests/CrossModuleAmbientTransactionTests.cs`'s header
comment) were available, the test was finally run for real. Verdict, in two parts:

1. **The underlying mechanism is real and works.** Two different modules' `BaseDbContext`s
   (`ReferenceDbContext`, `CatalogDbContext`) do share one physical `DbConnection`
   (confirmed via `ReferenceEquals`), and enlisting the second context's `SaveChanges` in
   the first context's transaction via `UseTransactionAsync(dbTransaction)` gives real
   atomicity: rolling back the originating context's transaction undid **both** contexts'
   writes, verified against Postgres, not mocked.
2. **But `AmbientDbTransactionRegistry`'s auto-detection does not fire the way
   `eventing.md` describes it.** Added two non-fatal diagnostics right after
   `BeginTransactionAsync()` + `SaveChangesAsync()`: `ambientTransactions.Find(...)`
   returned `null` for **both** the originating context's own connection and the second
   context's connection, reproducibly, on a clean database. The interceptor callbacks
   (`TransactionStarted`/`TransactionUsed`) that the registry relies on evidently don't
   fire for this call pattern (explicit `Database.BeginTransactionAsync()` rather than an
   implicit transaction opened by `SaveChanges` itself — unconfirmed which part of the
   pattern is the actual trigger condition without reading EF Core's interceptor dispatch
   source directly). The test only passes because of an added fallback that passes the
   raw `DbTransaction` object directly instead of trusting the registry lookup.

**Conclusion:** the "three separate modules" decision above stands — atomicity across
Inventory/Accounting/Sales is achievable via manual `DbTransaction` passthrough — but that
requires a small addition to `BuildingBlocks/Persistence` (a manually-set scoped
ambient-transaction holder), which is protected (`architecture.md` golden rule #4).

### 2.2 Decision: Outbox/Inbox saga instead — not the ambient-transaction holder (2026-09-10)

The BuildingBlocks change above was **not** made. Two reasons, the second decisive:

1. It only works because every `BaseDbContext` in the DI scope shares one physical
   `DbConnection` (`IScopedDbConnectionProvider`) — an in-process, single-database
   mechanism.
2. **This module set is a candidate for future microservice extraction.** The moment any
   one of Inventory/Accounting/Sales/Suppliers/Customers/Purchasing gets its own database,
   there is no longer a `DbConnection` to share — every handler built on this mechanism
   would need to be torn out and rewritten. Building on it now would be throwaway work.

Instead, all five orchestration handlers were retrofitted onto the **Outbox + Inbox
integration-event pattern** already used elsewhere in this codebase
(`FinalizeUploadCommandHandler`, `CreateTenantCommandHandler`'s `TenantSubscribedIntegrationEvent`,
etc. — `.agents/rules/eventing.md`, `add-integration-event` skill). This needed **zero**
`BuildingBlocks/Persistence` changes and, because `IOutboxWriter`/`IIntegrationEventHandler<T>`
don't change when the in-memory bus is later swapped for a real broker, survives a module
being pulled out to its own service without a rewrite.

**The pattern, applied identically everywhere:** commit the owning module's row first (the
source of truth), then publish an integration event via `IOutboxWriter.AddAsync` right
after — never call another module's mutating Contracts service in-process after the local
commit. Pre-commit, synchronous cross-module calls stay (dispensing-safety check, FEFO
deduction, stock receipt) because a rejected sale/receipt must never be persisted at all;
if one of those mutates Inventory but the local commit then fails, the handler compensates
inline (`RestockFromCancellationAsync`) before rethrowing — a narrow, same-request window,
not an async saga. Everything that used to run after the local commit (voucher posting,
AP/AR ledger posting, prescription refill bookkeeping, cancellation reversal) now happens
on the next Outbox dispatch cycle instead:

| Publisher (commits locally, then publishes) | Event | Consumers |
|---|---|---|
| `Sales.CreateSaleCommandHandler` | `SaleCompletedIntegrationEvent` | `Accounting` (posts GL voucher), `Prescriptions` (records dispense/refill) |
| `Sales.CancelSaleCommandHandler` | `SaleCancelledIntegrationEvent` | `Accounting` (voids voucher), `Inventory` (restocks) |
| `Purchasing.ReceivePurchaseOrderCommandHandler` | `PurchaseOrderReceivedIntegrationEvent` | `Suppliers` (posts AP ledger), `Accounting` (posts AP voucher) |
| `Suppliers.RecordSupplierPaymentCommandHandler` | `SupplierPaymentRecordedIntegrationEvent` | `Accounting` (posts voucher) |
| `Customers.RecordCustomerPaymentCommandHandler` | `CustomerPaymentRecordedIntegrationEvent` | `Accounting` (posts voucher) |

**Accepted residual risk, by design, not oversight:**
- A crash in the narrow window between a pre-commit mutation (e.g. stock deduction) and
  the local `SaveChangesAsync` is compensated inline; a crash between the local
  `SaveChangesAsync` and the `outbox.AddAsync` call immediately after it is a much smaller
  window than the multi-call chain this replaces, and matches the same accepted risk
  `FinalizeUploadCommandHandler` already lives with in this codebase.
- GL posting (and the other consumer-side effects) happen on the next Outbox dispatch
  cycle, not synchronously — callers see the sale/PO/payment as done before that runs. A
  permanently failing consumer dead-letters via the existing Outbox retry/backoff
  machinery (`GetDeadLetteredAsync`/`RedriveDeadLettersAsync`); the GL/AR/AP reconciliation
  reports (§4.3, still to be built — see §8) are the intended way to notice and fix one.
- No new state was added to `Sale`/`PurchaseOrder` to track "GL posted yet?" — reconciling
  via reports and the Outbox dead-letter view was judged sufficient for the stakes here,
  consistent with how every other integration event consumer in this codebase is trusted.

Retrofit applied to all five handlers listed above; each builds clean
(`dotnet build`, 0 warnings) and `Architecture.Tests` (55/55) still passes with the new
cross-module `.Contracts`-only event dependencies in place. Unit-test projects for all
nine pharmacy modules were added in a later pass — see §7.

---

## 3. Module map

New modules, in proposed `Order` (existing modules for reference: Auditing 300, Files
350, Webhooks 400, Billing 500, Catalog 600, Tickets 700, Notifications 750, Chat 800):

| Order | Module | Owns | Depends on (via `.Contracts`) |
|---|---|---|---|
| 820 | `Reference` | Medicine categories, tenant-level pharmacy settings (tax rate, invoice prefix, business info) | — |
| 840 | `Suppliers` | Supplier CRUD, AP ledger, supplier payments, supplier returns, cost history, statements | `Accounting` (post AP voucher) |
| 845 | `Customers` | Customer CRUD, AR ledger, customer payments | `Accounting` (post AR voucher) |
| 870 | `Accounting` | Chart of accounts, vouchers, GL, all financial reports (trial balance, balance sheet, P&L, AR/AP aging + GL reconciliation, cash movement, VAT return), banking (deposits + reconciliation), expenses | — (leaf; everyone posts *into* it) |
| 900 | `Inventory` | Medicines, batches, stock/inventory transactions, stock transfers, consignment positions/settlements, dead-stock + reorder-suggestion reports | `Reference` (categories) |
| 950 | `Purchasing` | Purchase orders (approve/receive/cancel), direct receipts | `Inventory` (receive stock), `Suppliers` (AP), `Accounting` (post) |
| 1000 | `Prescriptions` | Prescription records, refill-due tracking, dispensing-safety policy, DDA/narcotic compliance report | `Customers` (patient link, if patients are customers) |
| 1050 | `Sales` | Sales, sale items, cash shifts, refunds/returns | `Inventory` (FEFO deduct), `Prescriptions` (dispensing safety), `Accounting` (post), `Customers` (AR) |
| 1100 | `Onboarding` | Opening-balance migration wizard | `Inventory`, `Accounting` — **not on the critical path**, build last or defer entirely |

Rationale for consolidation vs. the root plan's finer-grained service list (§4 there):
Banking and Expenses are pure GL adjuncts (every operation there is "post a voucher, keep
a supporting record") — folding them into `Accounting` avoids two more modules whose
entire job is calling back into Accounting anyway. Consignment is inventory ownership
tracking, not a distinct business process — it stays inside `Inventory` as a feature
area. Categories/Settings are too small to be their own bounded context each, hence one
`Reference` module (comparable in size to Catalog's `Brand`).

If SPIKE-0's fallback triggers, replace the `Accounting`/`Inventory`/`Sales` rows above
with a single `Operations` module at order ~900, and keep `Purchasing`/`Prescriptions` as
satellites calling into it.

---

## 4. Per-module design (entities, features, gotchas)

Entity shapes are carried over from the root plan's §5 — only the module packaging
changes. `TenantId` is implicit (`BaseDbContext` filter) — don't add it to entity DTOs
that the root plan showed with an explicit `TenantId` column; that was written against a
schema without a framework-level filter.

### 4.1 `Reference`
- **Entities:** `MedicineCategory` (self-referencing tree, same pattern as Catalog's
  `Category` — copy it), `PharmacySettings` (one row per tenant: VAT rate, invoice
  number prefix/sequence, business info).
- **Features:** Category CRUD + tree + soft-delete/restore/trash (copy Catalog's
  pattern verbatim, `modules/catalog.md`); Settings get/update (single-row upsert, no
  list/search).
- Good first module to build (§6 Phase 0) — lowest risk, validates the whole module
  scaffold before anything with money/stock.

### 4.2 `Suppliers` / `Customers`
- **Entities:** `Supplier` (+ `SupplierLedgerEntry`, `SupplierPayment`, `SupplierReturn`,
  `SupplierCostHistory`); `Customer` (+ `CustomerLedgerEntry`, `CustomerPayment`).
  Ledger entries are **append-only** — never `UPDATE`/`DELETE` a posted ledger row;
  corrections are new offsetting entries, mirroring the Accounting voucher model.
- **Features:** CRUD, ledger listing + running balance, payment recording (which calls
  `Accounting.Contracts.IVoucherPostingService`), return recording, cost-history
  (Suppliers only), statement generation (PDF/CSV — reuse `Modules.Files` for storage).
- Both modules are structurally near-identical to `Modules.Billing`'s `Invoice`
  state-machine pattern (`Draft → Issued → Paid`-shaped) — read `modules/billing.md`
  before building either.

### 4.3 `Accounting` — Banking + Expenses status: ✅ built. `BankDeposit` (Dr Bank/Cr Cash,
posted immediately), `BankReconciliation` (GL-balance-vs-statement variance snapshot, no
line-level statement import/matching — that's the scope cut), `Expense` (Dr General
Expenses/Cr Cash or Bank). Migration `AddBankingAndExpenses` generated (purely additive).

- **Entities:** `AccountingAccount` (Code, Name, `AccountType` enum, `IsSystem`,
  `IsActive`), `AccountingVoucher` (`VoucherNo`, `VoucherDate`, `VoucherType`, `Source`,
  `ReferenceType`/`ReferenceId`, `Status` enum `draft|posted|void`, `Narration`,
  `PostedAt`/`PostedBy`), `AccountingVoucherLine` (`AccountId`, `DebitAmount`,
  `CreditAmount`), plus `BankDeposit`/`BankReconciliationLine` and `Expense`.
  `VoucherNo` sequence: a Postgres sequence per tenant schema, or a `SELECT ... FOR
  UPDATE` increment inside the posting transaction — **not** an app-level
  read-then-write without a lock (this was exactly the race the root plan's script
  69/97 fixed).
- **Contracts surface (what other modules call):**
  ```csharp
  public interface IVoucherPostingService
  {
      ValueTask<Guid> PostSystemVoucherAsync(PostVoucherRequest request, CancellationToken ct = default);
      ValueTask VoidAsync(Guid voucherId, string reason, CancellationToken ct = default);
  }
  ```
  `PostVoucherRequest` carries `VoucherType`, `ReferenceType`/`ReferenceId`,
  `IdempotencyKey` (the sale/purchase/payment id — enforces "one posted voucher per
  reference" the same way the root plan's partial unique index did, but as a DB unique
  index on `(TenantId, ReferenceType, ReferenceId)` *for posted vouchers only* — keep
  that as a DB constraint, it's data integrity, not business logic, per root plan §5), and
  `Lines[]` (already-mapped debit/credit lines — the *caller* owns account mapping via
  its own `ICoaMapper`, Accounting just validates + posts). This keeps Accounting from
  needing to know Sales/Purchasing shape at all.
- **Balanced-voucher invariant** — assert `Σdebits == Σcredits` inside
  `PostSystemVoucherAsync` before flipping status, **and** keep a Postgres `CHECK`/trigger
  as a backstop (root plan §5 — belt-and-suspenders, not primary enforcement).
- **Posted vouchers are immutable** — controller/Contracts expose only `Void`/`Reverse`,
  never `Update`, on a posted voucher (root plan §6.1).
- **Reports** — status per report:
  - ✅ `trial-balance`, `balance-sheet`, `profit-and-loss`, `cash-movement`, `vat-return`
    — built in `Accounting`, raw LINQ over `AccountingDbContext` (mechanical, per root
    plan §6.1's own assessment).
  - ✅ `ar-aging`, `ap-aging` — built, but **not** in `Accounting`: they live in
    `Customers`/`Suppliers` respectively, reading each module's own ledger entries
    directly (no cross-module call needed, since the aging math only needs a module's own
    subledger). This is a deliberate deviation from this section's original module
    map — reconsider only if a single combined AR+AP aging view is ever needed. Both use
    FIFO settlement (oldest debit paid down first) to bucket age, since no invoice-level
    payment allocation exists in this system.
  - ✅ `general-ledger` (`GetGeneralLedgerQuery(AccountId, FromUtc, ToUtc)`) — per-account
    detail with running balance, opening balance seeded from everything posted before
    `FromUtc`.
  - ✅ `ar-gl-reconciliation`, `ap-gl-reconciliation`, `inventory-gl-reconciliation` — each
    compares a subledger's current total (`Customers`' `GetTotalArBalanceQuery`,
    `Suppliers`' `GetTotalApBalanceQuery`, `Inventory`'s `GetStockValuationQuery` — all new,
    tiny, parameterless Mediator queries called via `IMediator.Send`, never a raw
    cross-schema SQL join) against the matching GL control account's current balance,
    returning `GlReconciliationDto(SubledgerTotal, GlBalance, Variance)`. Current-only (no
    `AsOfUtc`) because none of the three subledger totals are historical snapshots either —
    an apples-to-oranges comparison otherwise. A non-zero variance is exactly the kind of
    drift a dead-lettered Outbox event (§2.2's accepted residual risk) would cause; that's
    what these reports are for.

### 4.4 `Inventory`
- **Entities:** `Medicine` (GenericName, CategoryId → Reference, ReorderLevel,
  IsArchived), `MedicineBatch` (BatchNo, ExpiryDate, QuantityOnHand, CostPrice,
  SellingPrice, RackLocation, BranchId), `InventoryTransaction` (Type enum
  `purchase|sale|adjustment|transfer|dispose|consignment_receive|...`, Quantity,
  ReferenceType/ReferenceId), `StockTransfer` (+ line items, in-transit state machine —
  model this on `Modules.Tickets`' state-machine pattern: illegal transitions throw
  `CustomException(..., HttpStatusCode.Conflict)`), `ConsignmentPosition` +
  `ConsignmentSettlement`.
- **Contracts surface:**
  ```csharp
  public interface IStockDeductionService
  {
      ValueTask<StockDeductionResult> DeductForSaleAsync(
          IReadOnlyList<StockDeductionLine> lines, CancellationToken ct = default);
  }
  ```
  Loads candidate batches **within the caller's ambient transaction**, `FOR UPDATE`,
  ordered `ExpiryDate ASC` (FEFO), deducts oldest-first, throws
  `InsufficientStockException` (→ `409`) if unmet across all requested lines — check
  every line's availability *before* mutating any of them, so a multi-item sale doesn't
  partially deduct then fail (root plan §5/§12).
- **Value-generation footgun** — `MedicineBatch`/`InventoryTransaction` reached only via
  a parent's nav collection needs `Id.ValueGeneratedNever()` in its EF config
  (`database.md`, same issue Catalog's `ProductImage` and Chat hit).
- **Reorder suggestions / dead-stock report** — read-only queries here; no cross-module
  calls needed (pure Inventory data).

### 4.5 `Purchasing`
- **Entities:** `PurchaseOrder` (+ line items), state machine `Draft → Approved →
  PartiallyReceived → Received | Cancelled`.
- Receiving a PO calls `Inventory.Contracts.IStockReceiptService.ReceiveAsync(...)`
  (adds `InventoryTransaction`s + upserts `MedicineBatch` rows) and
  `Accounting.Contracts.IVoucherPostingService.PostSystemVoucherAsync(...)` (AP voucher)
  in one ambient transaction — same pattern class as Sales, just lower stakes (no
  dispensing-safety check, no FEFO deduction, only additions).
- Direct receipts skip the PO approval steps but go through the same receive+post path.

### 4.6 `Prescriptions`
- **Entities:** `Prescription` (+ items — medicine, prescribed qty, refills remaining),
  linked to a `Customer`/patient.
- **Contracts surface:**
  ```csharp
  public interface IDispensingSafetyPolicy
  {
      ValueTask EnsureDispensableAsync(
          IReadOnlyList<DispenseCheckLine> lines, Guid? prescriptionId, CancellationToken ct = default);
  }
  ```
  Throws a `CustomException(..., HttpStatusCode.Conflict)` (or a dedicated
  `DispensingSafetyException`) if a scheduled/narcotic medicine is being sold without a
  linked, unexpired prescription. **Called by `Sales` before its transaction opens**
  (root plan §6.2) — a rejected sale must never touch stock or accounting.
- Refill-due tracking and the DDA/narcotic compliance report are ordinary queries here.

### 4.7 `Sales`
- **Entities:** `Sale` (+ `SaleItem`), `CashShift` (open/close/summary), `Refund`/
  `SaleReturn`.
- `CreateSaleAsync` orchestration (per SPIKE-0's verdict, either ambient-transaction
  across modules or, if that failed, native single-DbContext transaction inside the
  merged `Operations` module):
  1. `Prescriptions.IDispensingSafetyPolicy.EnsureDispensableAsync(...)` — **before**
     opening the transaction.
  2. Begin transaction (`Serializable` — matches root plan §6.1's concurrency posture).
  3. `Inventory.IStockDeductionService.DeductForSaleAsync(...)`.
  4. Insert `Sale`/`SaleItem` rows.
  5. `Accounting.IVoucherPostingService.PostSystemVoucherAsync(...)` with lines from
     Sales' own `ICoaMapper` (deterministic account mapping, root plan §6.1).
  6. Commit.
- Cancellation reverses the voucher (`Void`) and restores stock (a `Inventory` "restock
  from cancellation" operation — **not** a raw undo of the deduction, since batches may
  have moved between the sale and the cancellation; restore into whatever batch(es) make
  sense per current policy, and make this an explicit, named operation so it's
  auditable).
- Endpoint set matches the root plan's §12 table almost verbatim — reuse it as the
  literal Contracts command/query shape (`CreateSaleCommand`, `GetSalesQuery`,
  `GetSaleByIdQuery`, `GetSalesStatsQuery`, `CancelSaleCommand`). `.WithIdempotency()` on
  `CreateSaleCommand`'s endpoint (framework feature, replaces root plan's bespoke
  `Idempotency-Key` table).

### 4.8 `Onboarding` (opening balances / migration wizard) — ✅ Built (order 1100)
- **Entity:** `OnboardingStatus` — one row per tenant (seeded pending on first run),
  guards `CompleteOnboardingCommand` against running twice.
- **`CompleteOnboardingCommand`** takes opening Cash/Bank/Inventory/AR/AP amounts and
  posts one balanced system voucher (`VoucherType: "opening_balance"`) via the existing
  `IVoucherPostingService` — Dr whichever asset amounts are non-zero, Cr AP if non-zero,
  with the remainder plugged to Owner's Equity (credit if assets exceed liabilities,
  debit — an opening deficit — otherwise).
- **Deliberately narrow scope:** does not also create opening customers/suppliers/stock —
  `CreateCustomerCommand`/`CreateSupplierCommand` already accept an `openingBalance`, and
  opening stock goes through the normal receipt/consignment paths before this runs. This
  command only closes the one gap those don't cover: the top-level balance-sheet entry
  that ties everything together. A richer multi-step "wizard" UX can be layered on the
  frontend later without any backend change.
- Migration `InitialCreate` (new `onboarding` schema) generated.

---

## 5. Permissions

One `{Module}Permissions` static class per module (mirrors `CatalogPermissions`),
registered via `PermissionConstants.Register({Module}Permissions.All)` in
`ConfigureServices`. Proposed resource/action shape, same as the rest of the kit
(`Resource.Action`, e.g. `Sales.Create`, `Sales.Cancel`, `Accounting.PostVoucher`,
`Accounting.VoidVoucher`, `Inventory.AdjustStock`, `Inventory.Transfer`):

| Module | Resources needing more than CRUD (`View/Create/Update/Delete`) |
|---|---|
| Sales | `Cancel`, `ViewStats` |
| Accounting | `PostVoucher`, `VoidVoucher`, `ViewReports` (reports are read-heavy and widely granted — keep this separate from account/voucher CRUD) |
| Inventory | `AdjustStock`, `Transfer`, `Dispose`, `ReceiveConsignment` |
| Purchasing | `Approve`, `Receive`, `Cancel` |
| Prescriptions | `OverrideDispensingSafety` (a narrow, heavily-audited permission — most roles should never have it) |
| Suppliers/Customers | `RecordPayment`, `RecordReturn`, `ViewStatement` |

Map these onto the existing role set from `lib/security/rbac-types.ts` (Owner,
Pharmacist, Cashier, etc.) as a seed data task in each module's `IDbInitializer` —
don't invent a new role model; Identity already has one.

---

## 6. Build order (module-by-module, not traffic-cutover — that's the later step)

Since this phase is "build the .NET API completely, migrate routes later," there's no
`BACKEND_TARGET_<DOMAIN>` flag work yet (root plan §9) — that starts once this is done.
Order below is dependency + risk driven, matching §3's `Order` column:

1. ✅ **Phase 0 — Foundations & spike.** `Reference` module built and verified. `SPIKE-0`
   (§2) written but **blocked** — see §0's status table; the modules below were built on
   the documented-non-atomic fallback pattern instead of waiting on it further.
2. ✅ **Phase 1 — Ledger-adjacent.** `Suppliers`, `Customers` built (CRUD + ledger).
3. ✅ **Phase 2 — Accounting.** Chart of accounts, voucher posting engine, Trial Balance
   report built. Suppliers'/Customers' payment posting wired to it (sequential, not yet
   atomic — §0).
4. ✅ **Phase 3 — Inventory.** Medicines/batches/FEFO deduction/receipt built. Concurrency
   protection (Serializable transaction + retry, in place of `FOR UPDATE`) is documented
   as the caller's responsibility, unverified without SPIKE-0/a live DB.
5. ✅ **Phase 4 — Purchasing.** Built; `ReceivePurchaseOrder` exercises the
   Inventory+Suppliers+Accounting cross-module write path — **still unverified** pending
   SPIKE-0, since Docker access was blocked the whole time this phase was built.
6. ✅ **Phase 5 — Prescriptions.** Built — dispensing-safety policy + refill tracking.
   Added `Medicine.IsControlled` to Inventory to support the controlled-substance check.
7. ✅ **Phase 6 — Sales.** Built — `CreateSale`/`CancelSale` orchestrate all three
   upstream modules per root plan §12. Credit sales (partial payment / AR posting) are
   explicitly deferred, not silently dropped (§0).
8. ✅ **Phase 7 — Onboarding** (§4.8) — built.

Each phase ends with: `dotnet build` (0 warnings — `TreatWarningsAsErrors`),
`dotnet test src/Tests/Architecture.Tests` (module-boundary + tenant-isolation rules),
the module's own unit test project, and an integration test project for anything
touching money/stock, before moving to the next phase.

---

## 7. Testing (per module)

- **Unit tests** (`Tests/{Module}.Tests`, xUnit + Shouldly + NSubstitute + AutoFixture) —
  ✅ one project per module now exists for all nine pharmacy modules
  (`Reference.Tests`, `Suppliers.Tests`, `Customers.Tests`, `Accounting.Tests`,
  `Inventory.Tests`, `Purchasing.Tests`, `Prescriptions.Tests`, `Sales.Tests`,
  `Onboarding.Tests`; 123 tests total, all green), covering the domain-invariant scenarios
  called out in root plan §10 ("cannot post an unbalanced voucher" —
  `AccountingVoucherTests`, "cannot deduct below on-hand quantity" — `MedicineBatchTests`,
  credit-sale/on-account rules — `SaleTests`, etc.), following `Catalog.Tests`' existing
  convention (pure domain-entity tests, `#region`-grouped, no DbContext/mocking needed).
  **Not yet covered:** handler-level tests (mocking `IOutboxWriter`/cross-module service
  interfaces to assert orchestration) and validator tests — the domain layer carries the
  real invariants and was prioritized; handler/validator coverage is a good next
  increment, not a gap that blocks anything today.
- **`Architecture.Tests`** — extend `HandlerValidatorPairingTests`-style coverage to the
  new modules automatically (it scans by convention); verify module-boundary rules catch
  a deliberate violation (e.g. temporarily reference `Modules.Inventory` runtime from
  `Modules.Sales` and confirm the test fails) before trusting it silently passes because
  nothing violates it yet.
- **Integration tests** (`Tests/Integration.Tests`, Testcontainers.PostgreSql, Docker
  required) — this is where SPIKE-0, FEFO race conditions, and voucher-posting races get
  proven for real, per root plan §10/§11.
- **Contract fidelity checklist** — every scenario in the *existing* Next.js
  `*.test.ts` files (root plan §10) for a domain must have a named C# equivalent before
  that domain is considered "done," even though there's no traffic cutover yet to gate
  on.

---

## 8. Open items needing a decision before/while building

1. ✅ **SPIKE-0 verdict + atomicity retrofit** (§2/§2.2) — resolved. SPIKE-0 ran for real
   and proved the shared-connection mechanism works, but it was deliberately **not**
   adopted (doesn't survive future microservice extraction). All five orchestration
   handlers were retrofitted onto the Outbox/Inbox integration-event saga pattern instead
   — see §2.2 for the full writeup, the event/consumer table, and the accepted residual
   risk windows. No `BuildingBlocks/Persistence` changes were needed.
2. ✅ **Patient/Customer relationship** — resolved: prescriptions attach to `Customer`
   (`Prescription.CustomerId`), no separate Patient concept was introduced.
3. ✅ **VAT** — resolved, following the recommended ownership split.
   `Reference.PharmacySettings.VatRatePercent` is the single source of truth; Sales reads
   it via `GetPharmacySettingsQuery` (Mediator query, cross-module via Contracts) when
   completing a sale and computes the VAT portion of the (VAT-inclusive) total, carried on
   `SaleCompletedIntegrationEvent.VatAmount`. Accounting's consumer splits the revenue
   line into net-of-VAT + a new `VAT Payable` (2100) system account line. A `vat-return`
   report (`GetVatReturnQuery`) sums VAT collected for a period; input VAT (from
   purchases) isn't modeled yet, so `NetVatPayable` currently equals `VatCollected` —
   documented in `VatReturnReportDto`'s own remarks, not silently wrong.
4. ✅ **Role/permission seed mapping** — resolved. `Modules.Identity/Data/PharmacyRoleSeedData.cs`
   transcribes the root repo's `lib/security/rbac-types.ts` roles (Manager/Pharmacist/Cashier/Staff —
   admin and superadmin already map onto the framework's existing Admin/Root roles, no new role
   needed) onto this kit's granular permission model by Resource/Action string match against
   `PermissionConstants.All`, avoiding new cross-module project references from Identity onto the
   eight pharmacy modules' Contracts assemblies. Full mapping rationale, including one deliberate
   divergence (`controlled_substances:dispense` does **not** carry over to
   `Prescriptions.DispensingSafety.Override` for Pharmacist — that permission bypasses the
   prescription-validity check entirely, a materially stricter grant), is documented in that file's
   header comment.
5. ✅ **Credit sales / AR posting** — resolved. `Sale.Finalize` now allows
   `PaymentAmount < TotalAmount` when `CustomerId` is set (`Sale.BalanceDue`); the payment
   split and AR line are posted off `SaleCompletedIntegrationEvent` (Accounting posts
   Dr payment-account + Dr AR / Cr Revenue; a new `Customers` consumer posts the AR ledger
   entry, `CustomerLedgerEntryType.Sale` — the enum value already existed, unused until
   now).
6. ✅ **CashShifts** — resolved. `Sales.Domain.CashShift` (Open→Closed), one open shift at
   a time, `GetCashShiftSummaryQuery` reconciles `OpeningFloat + cash sales in the shift
   window` against `ClosingCashCounted` and reports the variance. Migration
   `AddCashShifts` generated (purely additive).
7. ✅ **Consignment** (Inventory) — resolved. `ConsignmentPosition` tracks each consignment
   shipment against its own `MedicineBatch` (received via the existing `IStockReceiptService`
   unchanged — no FEFO/receipt code touched); quantity sold is derived as
   `QuantityReceived - batch.QuantityOnHand`, so no hook into stock deduction was needed
   either. `SettleConsignmentCommand` pays for everything sold since the last settlement
   and — following the same Outbox/Inbox pattern as Phase A — publishes
   `ConsignmentSettledIntegrationEvent`, consumed by `Suppliers` (AP ledger) and
   `Accounting` (Dr Inventory/Cr Accounts Payable, recognizing the asset only at
   settlement, not at consignment receipt — a deliberate simplification). Migration
   `AddConsignment` generated (purely additive).
8. **Banking + Expenses** — resolved (see §4.3 note): `BankDeposit`, `BankReconciliation`
   (GL-vs-statement variance, no line-level import/matching), `Expense`.
9. ✅ **Remaining GL reports** — fully resolved, including general-ledger and the three GL
   reconciliation reports (see §4.3's Reports list).

---

## 9. What this plan deliberately does not cover

- Next.js route deletion/proxying, frontend API-client flag wiring, and traffic
  cutover — that is `docs/dotnet-migration-plan.md` §9 (root repo), unchanged, and starts
  only once this backend is functionally complete and tested.
- Supabase Auth → Identity user migration (password-hash non-portability, forced reset
  flow) — still applies conceptually (root plan §7), but is now "point the existing
  `Modules.Identity` at the real user list and force resets," not "build an auth system."
- Removing the Postgres RLS/trigger logic from the *current* Supabase database — out of
  scope until the Next.js side is actually being decommissioned.

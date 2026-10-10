# Branch-scoping plan — foundation + handoff

Status: **foundation complete** (this doc). Per-module `BranchId` columns/filters are a **separate,
later wave** — do not add them without re-reading this doc first.

This phase built the shared `ICurrentBranch` resolution primitive the next wave needs. It did
**not** touch any Sales/Inventory/Purchasing/Accounting entity. See "What was built" below for the
exact API, and "Scope table" for what the next wave must still do, table by table.

## 1. Scope table — Next.js `branch_id` columns → .NET module/entity

Source: `grep -rln "branch_id" scripts/*.sql` (28 files) plus the `app/api/**` and
`lib/server/services/*.ts` call sites that read/write it. "Nullable?" is the column's *current*
constraint in the Next.js Postgres schema (not a recommendation — see §2 for why it's kept as-is).

| Next.js table | branch_id nullable? | Source script(s) | .NET module | .NET entity (current) |
|---|---|---|---|---|
| `sales` | **No** (NOT NULL + FK, script 42) | 36, 42, 43, 72, 76, 77, 85, 86, 89 | Sales | `Sale` |
| `sale_items` | **No** | 36, 42 | Sales | `SaleItem` |
| `sale_payments` | Yes (`branch_id UUID REFERENCES branches(id)`, no NOT NULL) | 89 | Sales | *(no direct entity yet — sale payment lines; check `Sale`/`SaleItem` siblings)* |
| `cash_register_shifts` | **No** (`NOT NULL REFERENCES branches(id) ON DELETE RESTRICT`) | 60 | Sales | `CashShift` |
| `inventory_transactions` | **No** | 36, 42 | Inventory | `InventoryTransaction` |
| `medicine_branch_stock` | **No** (`NOT NULL`, per-branch stock ledger) | 67 | Inventory | `MedicineLocationStock` |
| `medicine_batches` | **No** (`NOT NULL`, FEFO) | 77 | Inventory | `MedicineBatch` |
| `stock_transfers` (`from_branch_id`, `to_branch_id`) | **No** (both `NOT NULL`) | 87/96/98 | Inventory | `StockTransfer` |
| `warehouses` | **No** | 36, 42 | Inventory | *(no direct equivalent found — confirm against `MedicineLocationStock`/a warehouse concept before porting)* |
| `goods_receipts` | **No** | 36, 42 | Purchasing | `DirectGoodsReceipt` (confirm against `PurchaseOrder`/receiving flow — Next.js receiving is PO-driven in later scripts, e.g. 77/84/87) |
| `goods_receipt_items` | **No** | 36, 42 | Purchasing | `DirectGoodsReceiptLine` |
| `accounting_vouchers` | **Yes** (`ON DELETE SET NULL`; "NULL = legacy/tenant-wide") | 64, 65, 87, 94, 98 | Accounting | `AccountingVoucher` |
| `accounting_voucher_lines` | **Yes** (inherits from voucher) | 64, 65, 98 | Accounting | `AccountingVoucherLine` |
| `bank_deposits` | **No** (`NOT NULL`) | 64, 87 | Accounting | `BankDeposit` |
| `expenses` | **Yes** (`ON DELETE SET NULL`) | 94 | Accounting | `Expense` |
| `bank_reconciliation` / bank statement tables | **Yes** (`ON DELETE SET NULL`) | 100 | Accounting | `BankReconciliation` / `BankStatementImport` / `BankStatementLine` |
| `supplier_ledger_entries` | **Yes** (`ON DELETE SET NULL`) | 64, 65 | Suppliers | `SupplierLedgerEntry` |
| `supplier_returns` | **Yes** (`ON DELETE SET NULL`, added in script 65) | 65 | Suppliers | `SupplierReturn` |
| `customer_payments` | **Yes** (`ON DELETE SET NULL`; "nullable for historical rows") | 63 | Customers | *(no direct entity yet — customer receipts; confirm against `CustomerLedgerEntry`)* |
| `customer_ledger_entries` | **Yes** (`ON DELETE SET NULL`) | 63 | Customers | `CustomerLedgerEntry` |
| `consignment_*` tables | **Yes** (`ON DELETE SET NULL`) | 101 | Inventory | `ConsignmentPosition` / `ConsignmentSettlement` |
| `users.current_branch_id` | Yes (nullable, `ON DELETE SET NULL`) — **this is the per-user selection, not a transactional column** | 37, 79 | Identity | `FshUser.CurrentBranchId` (**already exists**) |
| `branches` (catalog table itself) | n/a | 36 | Multitenancy | `Branch` (**already exists**) |

Modules not in the table above (Catalog/Reference/Billing/Chat/Files/Notifications/Tickets/
Webhooks/Auditing/Onboarding/Prescriptions) have no `branch_id` in the Next.js schema and are out
of scope.

**Entities marked "no direct entity yet" / "confirm against"** need a quick look by the next
wave before adding `BranchId` — the .NET domain model doesn't map 1:1 onto every Next.js table
(e.g. receiving goods is PO-driven across `PurchaseOrder`/`PurchaseOrderLine` in several later
scripts rather than a standalone `goods_receipts` table; `DirectGoodsReceipt` may be the direct
receiving path and PO-based receiving may need its own `BranchId`). Don't assume the mapping above
is exhaustive — it is the result of a text-based grep over the SQL, not a line-by-line schema diff.

## 2. Semantics decision: required vs. nullable, and what "no branch" means

**Decision — mirror the Next.js source exactly, per entity, as tabulated above.** Do not invent a
single tenant-wide "see everything" mode and do not make nullable columns required or vice versa.
Reasoning, from reading the actual Next.js code (not assumed UX):

- **Transactional/stock entities are always resolved to one concrete branch, never left unscoped.**
  `create_sale_with_items`, `receive_purchase_goods`, `record_bank_deposit`,
  `create_stock_transfer` etc. all do: *use the header's resolved branch → else the user's
  `current_branch_id` → else the tenant's oldest branch → else raise an exception.* There is no
  "Owner sees all branches, unscoped write" path for these — a sale, stock movement, batch, or
  bank deposit is **always** attributed to exactly one branch. This is why `sales`,
  `sale_items`, `inventory_transactions`, `medicine_batches`, `medicine_branch_stock`,
  `stock_transfers`, `cash_register_shifts`, `bank_deposits`, `goods_receipts`/`goods_receipt_items`
  are all `NOT NULL`.
- **Ledger/reporting entities keep `branch_id` nullable on purpose**, per script 64's own comment:
  *"Nullable branch_id: NULL = legacy / tenant-wide; reports filter by branch when provided."*
  `accounting_vouchers`, `accounting_voucher_lines`, `supplier_ledger_entries`,
  `customer_payments`, `customer_ledger_entries`, `expenses`, `bank_reconciliation`,
  `consignment_*` fall here. In practice almost every *new* row still gets a branch (the RPCs
  resolve it the same way as above and stamp it), but the column stays nullable so: (a) rows
  created before branch-scoping existed don't need a backfill guess, and (b) report/filter
  endpoints can accept an *optional* `branchId` query param and return tenant-wide totals when
  it's omitted (see `accounting_opening_balance(p_branch_id UUID DEFAULT NULL)`).
- **`users.current_branch_id` (→ `FshUser.CurrentBranchId`) is the odd one out**: it's the user's
  own *selection*, already nullable, already built, and is itself one of the three inputs the
  resolution chain reads — it is not a column the next wave adds.
- **No tenant-wide/unscoped "superadmin sees all branches" switch exists in the Next.js source.**
  A root/operator calling without a resolved tenant has no branch catalog to resolve against at
  all (there's no tenant), which is the one case `ICurrentBranch.GetBranchIdAsync` legitimately
  returns `null` for. Within a resolved tenant, every role — including Owner — still gets routed
  through the same "pick my current branch, or the tenant's default" chain. If a future UI need
  for a true "all branches" toggle emerges, that is a new product decision, not something to
  retrofit into this primitive silently.

**Practical rule for the next wave:** when adding `BranchId` to an entity in the "No" (required)
rows of the table above, call `ICurrentBranch.RequireBranchIdAsync()` in the command handler and
let it throw `NotFoundException` if a tenant genuinely has zero branches (shouldn't happen past
onboarding — every tenant gets a default branch, see script 36/79). When adding `BranchId` to an
entity in the "Yes" (nullable) rows, call `ICurrentBranch.GetBranchIdAsync()` and persist `null`
when it returns `null`; expose an optional `branchId` filter on the corresponding list/report
query exactly like `accounting_opening_balance` does.

## Status (2026-10-10)

Sections 3–5 describe the first phase and are kept for history; they are out of date. Since then:

- `ICurrentBranch` is used across every module: writes resolve the branch with `RequireBranchIdAsync`,
  lists and reports confine reads with `ResolveListBranchFilterAsync(requested)` (Branches.ViewAll may pick
  a branch or all; everyone else is pinned to their own), and single-record reads use
  `CanSeeBranchAsync`/`EnsureCanSeeBranchAsync` (404 for another branch's record).
- Reports and lists take an optional `branchId` query parameter (overview, P&L, balance sheet, cash
  movement, TB grouped, sales stats, narcotic register, top-selling, category performance, dead stock,
  expired/expiring batches, reorder suggestions, medicine search/stats, consignment settlements, purchase
  orders, IRD sales/purchase registers, returns/refunds stats, dashboard context).
- Cash shifts are per branch; purchase orders carry `BranchId`; supplier returns post a voucher; branch-filtered
  ledgers/statements recompute balances from that branch's entries; the opening-balance wizard commit takes a
  `branchId`.
- The frontend has a working branch switcher (`GET /branches/context`, `POST /branches/switch`) in the top bar,
  branch pickers on reports for ViewAll users, and Branch columns where rows can span branches.

## 3. What was built (this phase)

### `ICurrentBranch` — `src/Modules/Multitenancy/Modules.Multitenancy.Contracts/ICurrentBranch.cs`

```csharp
namespace FSH.Modules.Multitenancy.Contracts;

public interface ICurrentBranch
{
    Task<Guid?> GetBranchIdAsync(CancellationToken cancellationToken = default);
    Task<Guid> RequireBranchIdAsync(CancellationToken cancellationToken = default);
}
```

Any module whose entities carry a `BranchId` depends on this via `Modules.Multitenancy.Contracts`
— already a common dependency for tenant-scoped modules — never on `Modules.Multitenancy`'s
runtime project. This mirrors how `ICurrentUser` (`FSH.Framework.Core.Context`) is consumed
everywhere, except `ICurrentBranch` could not live in `BuildingBlocks` without `BuildingBlocks`
taking a dependency on two modules' `.Contracts` (`Identity.Contracts` for
`IUserProfileService`, `Multitenancy.Contracts` for `IBranchService`/`Branch`), which would
invert the module → BuildingBlocks dependency direction. `Modules.Multitenancy` already depends
on `Identity.Contracts` for exactly this purpose (`GetBranchContextQueryHandler`/
`SwitchBranchCommandHandler` already call `IUserProfileService`), so implementing it there is the
minimal, already-precedented place — no `BuildingBlocks` change was made or needed.

**Resolution order** (first match wins; implemented in `CurrentBranch.ResolveAsync`):

1. **`X-Branch-Id` request header**, if present — parsed as a `Guid`, then validated via
   `IBranchService.IsActiveBranchOfCurrentTenantAsync`. An unparsable value, or a value that isn't
   an active branch of the caller's resolved tenant, throws `ForbiddenException` (never silently
   ignored) — this is the "rejects mismatched `X-Branch-Id` headers" behavior
   `docs/dotnet-migration-plan.md` §6.3 already called for.
2. **`FshUser.CurrentBranchId`** (via `IUserProfileService.GetCurrentBranchIdAsync`, a DB lookup on
   the Identity module's per-tenant database) — the user's persisted selection, read/write via the
   existing `GET`/`PUT /api/v1/branches/branch-context` (`GetBranchContext`/`SwitchBranch`)
   endpoints.
3. **The tenant's default branch** — its oldest branch — via the new
   `IBranchService.GetDefaultBranchIdAsync()` (added this phase; `BranchService.cs`). A *separate*
   method from the existing `GetAllForCurrentTenantAsync()` because that one is ordered by `Name`
   (correct for the branch-picker UI) while the Next.js default-branch fallback is "oldest branch
   by `created_at`" (scripts 36/42/79) — reusing the name-ordered list would have silently changed
   which branch gets picked as the default.
4. **`null`** — only when the tenant has zero branches, or when no tenant is resolved at all (a
   root/operator call). `IBranchService` calls that require a tenant throw
   `UnauthorizedException("invalid tenant")` in that case; `CurrentBranch` catches that specific
   exception at both call sites and converts it to "no branch" rather than letting it bubble as an
   unrelated-looking 401.

**Caching:** `CurrentBranch` is registered `Scoped` (one instance per request) and memoizes the
resolved value (including the "no branch" outcome) in an instance field after the first call, so
repeated calls within one request handler/pipeline don't re-hit the database or re-validate the
header — the same pattern Finbuckle's per-request tenant resolution follows.

### Supporting change: `IBranchService.GetDefaultBranchIdAsync()`

Added to `src/Modules/Multitenancy/Modules.Multitenancy.Contracts/IBranchService.cs` and
implemented in `src/Modules/Multitenancy/Modules.Multitenancy/Services/BranchService.cs`:

```csharp
/// <summary>The tenant's default branch — its oldest branch (first created) — or null when the
/// tenant has none.</summary>
Task<Guid?> GetDefaultBranchIdAsync(CancellationToken cancellationToken = default);
```

### DI registration

`src/Modules/Multitenancy/Modules.Multitenancy/MultitenancyModule.cs`,
`ConfigureServices`:

```csharp
builder.Services.AddScoped<IBranchService, Services.BranchService>();
builder.Services.AddScoped<ICurrentBranch, Services.CurrentBranch>();
```

### Files added/changed (this phase)

- `src/Modules/Multitenancy/Modules.Multitenancy.Contracts/ICurrentBranch.cs` (new)
- `src/Modules/Multitenancy/Modules.Multitenancy.Contracts/IBranchService.cs` (added
  `GetDefaultBranchIdAsync`)
- `src/Modules/Multitenancy/Modules.Multitenancy/Services/CurrentBranch.cs` (new)
- `src/Modules/Multitenancy/Modules.Multitenancy/Services/BranchService.cs` (added
  `GetDefaultBranchIdAsync` implementation)
- `src/Modules/Multitenancy/Modules.Multitenancy/MultitenancyModule.cs` (registered
  `ICurrentBranch`)
- `src/Tests/Multitenancy.Tests/Services/CurrentBranchTests.cs` (new — 11 tests: header override
  happy path, invalid-GUID header, inactive/foreign-branch header, header-with-no-tenant, DB
  fallback, tenant-default fallback, no-branch/no-tenant → null, `RequireBranchIdAsync` throw and
  success, per-request memoization)

**Not touched:** no `BranchId` column was added to any Sales/Inventory/Purchasing/Accounting/
Suppliers/Customers entity. No `src/BuildingBlocks/**` file was modified. No existing endpoint's
behavior changed — `GetBranchContext`/`SwitchBranch` are untouched; `ICurrentBranch` is new surface
area, not yet called from anywhere outside its own tests.

## 4. Build/test results (this phase)

| Command | Result |
|---|---|
| `dotnet build` — `Modules.Multitenancy.Contracts.csproj` | 0 warnings, 0 errors |
| `dotnet build` — `Modules.Multitenancy.csproj` | 0 warnings, 0 errors |
| `dotnet build` — `Multitenancy.Tests.csproj` | 0 warnings, 0 errors |
| `dotnet build` — `FSH.Starter.Api.csproj` (full host, all 14 modules) | 0 warnings, 0 errors |
| `dotnet test src/Tests/Multitenancy.Tests` | **129/129 passed** (11 new `CurrentBranchTests` + 118 pre-existing) |
| `dotnet test src/Tests/Identity.Tests` | **312/312 passed** (no regressions — `IUserProfileService`/`FshUser.CurrentBranchId` untouched) |
| `dotnet test src/Tests/Architecture.Tests` | **55/55 passed** (module-boundary rules hold; `ICurrentBranch` consumption pattern doesn't violate the Contracts-only cross-module rule) |
| `dotnet build src/FSH.Starter.slnx` (whole solution) | **Fails before any of this phase's changes** — pre-existing `NU1903`/`NU1902` "Warning As Error" NuGet advisory failures on `SSH.NET` (`Integration.Tests`, `Integration.Middleware.Tests`) and `Microsoft.Build.Tasks.Git` (`FSH.CLI`), unrelated to branch scoping. Every project actually touched by this phase, plus the full API host and all module runtime projects, builds clean individually (see rows above). |

## 5. Handoff — what the next wave does, per module

For each entity in the "No" (required) column of the scope table: add `BranchId` (non-nullable
`Guid`, FK pattern consistent with how `Modules.Multitenancy`'s `Branch` is already referenced
loosely — see `FshUser.CurrentBranchId`'s doc comment on why cross-database FKs aren't used here),
set it in the command handler via `ICurrentBranch.RequireBranchIdAsync()`, add a migration, add a
query filter/parameter for branch-scoped reads, and add tests. For each entity in the "Yes"
(nullable) column: same shape but `Guid?`, sourced via `ICurrentBranch.GetBranchIdAsync()`, plus an
optional `branchId` filter on the corresponding list/report endpoint. Re-confirm the
"no direct entity yet" rows against the current Next.js source before assuming the mapping.

# Accounting integration: how it works, what was broken, what's fixed

Question this answers: **is the accounting module actually linked to inventory,
suppliers, sales, returns, and refunds — and does it work?**

Short answer: the *mechanism* is sound and well-designed, but it was **silently
dead for most tenants** due to a missing seed step, plus two real linkage bugs.
Both are fixed as of migrations `80` and `81` (2026-07-11).

## How it actually works (mechanism)

Accounting is **not** posted by application code (`lib/server/services/*.ts`).
Application code only writes the operational rows (`sales`, `goods_receipts`,
`sales_refunds`, `supplier_returns`, `medicine_returns`, etc.) and the physical
stock movement. **Postgres triggers** on those tables then call a
`accounting_post_*_voucher()` function that inserts the actual
`accounting_vouchers` + `accounting_voucher_lines` double-entry rows.

This lives entirely in `scripts/51-*.sql` through `scripts/65-*.sql`, plus the
two new migrations from this audit (`80`, `81`). If you're debugging "why didn't
this sale/return/purchase show up in the trial balance," the answer is never in
the TypeScript service files — it's in the trigger function for that table.

Every `accounting_post_*_voucher()` function is **idempotent**: it checks for an
existing `posted` voucher with the same `(reference_type, reference_id)` before
inserting (unique index `ux_accounting_voucher_reference_posted`), and it
**silently returns** (no error, no row) if required accounts don't exist yet or
the amount is zero/negative. That silent-return behavior is *why* the root-cause
bug below went undetected — there's no error to notice.

## Flow → accounting linkage (as of migration 81)

| Flow | Where it's triggered from | Linked? | GL effect |
|---|---|---|---|
| Medicine create/update + supplier + stock | `medicine-service.ts` → `inventory-supplier-receipt-service.ts` → `goods_receipts` insert | ✅ Yes | Dr Inventory (5000) / Cr Trade Payables (2100) |
| Purchase / goods receipt | `purchase-service.ts` → `goods_receipts.status = 'received'` | ✅ Yes | Dr Inventory (5000) / Cr Trade Payables (2100) |
| Sale | `sales-service.ts` → `create_sale_with_items` RPC → `sales` insert/payment update | ✅ Yes | Dr Cash/AR (1000/1100) / Cr Sales (3000) + Output VAT (2000); Dr COGS (4000) / Cr Inventory (5000) |
| Sales refund (`/dashboard/refunds`) | `refunds-service.ts` → `sales_refunds` | ✅ Yes | Dr Sales Returns (3100) / Cr Cash (1000); Dr Inventory (5000) / Cr COGS (4000) |
| Customer return (`/dashboard/returns`) | `returns-service.ts` → `medicine_returns` | ✅ **Fixed in migration 80** (was: not linked at all) | Same shape as sales refund |
| Supplier return | `supplier-return-service.ts` → `supplier_returns` | ✅ GL always worked; **subledger fixed in this session** | Dr Trade Payables (2100) / Cr Inventory (5000), **and now** a `credit_note` entry reducing that supplier's own ledger balance |
| Supplier payment | `supplier-payment-service.ts` → `post_supplier_payment` RPC | ✅ Yes | Dr supplier's own AP account / Cr Cash or Bank |
| Customer payment | `customer-payment-service.ts` → RPC in `scripts/63-*.sql` | ✅ Yes | Dr Cash/Bank / Cr Accounts Receivable (1100) |

## What was actually broken

### 1. Root cause: most tenants had no chart of accounts at all (critical)

The standard chart of accounts (`1000` Cash, `3000` Sales revenue, `4000` COGS,
`5000` Inventory, `3100` Sales returns, `2100` Trade payables, etc.) was seeded
by a **one-time bulk `INSERT ... SELECT id FROM tenants`** in migrations `51`,
`53`, `58`, and `65`. It only covered tenants that existed *at the moment each
migration ran*. No code path ever seeded it for a tenant created afterward —
`app/api/onboarding` and `app/api/tenants` (superadmin create-tenant) never
called anything to set up a chart of accounts.

Verified directly against the database before fixing:

| Tenant | Created | Accounts before fix |
|---|---|---|
| Default Pharmacy | 2026-03-13 | 22 |
| TestPharmacy | 2026-03-16 | 11 |
| EjanTe | 2026-03-16 | 14 |
| ishwor | 2026-03-29 | 11 |
| moonlight | 2026-04-12 | 11 |
| Kathmandu Medical Hall | 2026-07-09 | **0** |
| My Pharmacy | 2026-07-09 | **0** |
| dinesh pharma | 2026-07-09 | **0** |
| Testing | 2026-07-09 | **2** (only auto-created supplier AP accounts) |

Every tenant onboarded since ~mid-April had a **completely dark accounting
module**: sales, purchases, returns, refunds, and payments all posted their
operational rows and moved physical stock correctly, but the trigger functions
silently no-op'd on the missing accounts, so `accounting_vouchers` never got a
single row. Every accounting report (trial balance, P&L, balance sheet, AP/AR
aging) would have shown empty or zero for these tenants, with no error anywhere
to explain why.

**Fix:**
- `lib/server/services/tenant-service.ts` — added `seedDefaultChartOfAccounts()`,
  called from both `app/api/onboarding/route.ts` and `app/api/tenants/route.ts`
  (POST), so every tenant created from now on gets the standard chart at signup.
- `scripts/81-backfill-chart-of-accounts.sql` — seeded the missing chart for
  every existing tenant, then retroactively ran every `accounting_post_*` function
  for every historical transaction (idempotent, so this only fills real gaps).
  **Result: 40 previously-missing vouchers were posted** (34 sales, 3 purchases,
  2 refunds, 1 supplier payment) across the affected tenants.

### 2. Customer returns were never linked to accounting (high risk)

`medicine_returns` (the table behind `/dashboard/returns`, distinct from
`sales_refunds` behind `/dashboard/refunds`) had **no accounting trigger at
all** — confirmed by grepping every migration for `CREATE TRIGGER` referencing
that table; the only one that existed was a plain `updated_at` trigger. A
completed customer return restored physical stock (`restore_return_stock` RPC)
but never reversed revenue or COGS, and never touched cash/AR.

**Fix:** `scripts/80-medicine-returns-accounting.sql` adds
`accounting_post_medicine_return_voucher()` and a trigger that fires the same
way `sales_refunds`' trigger does — on the transition into `status = 'completed'`,
which is also exactly when stock gets restored. Same double-entry shape as a
sales refund: Dr Sales Returns (3100) / Cr Cash (1000), plus Dr Inventory (5000)
/ Cr COGS (4000) for the returned quantity's cost.

### 3. Supplier returns never updated the per-supplier AP subledger (medium risk)

`supplier-return-service.ts` inserts `supplier_returns` with `status: "completed"`,
which correctly fires the existing GL trigger (Dr 2100 / Cr Inventory) — so the
**tenant-wide** trial balance was never wrong. But the service never wrote
anything to `supplier_ledger_entries` (the per-supplier statement/aging table),
so a given supplier's own ledger kept showing the full original goods-receipt
invoice amount as still owed, even after goods were returned. Accounts
Payable aging for that specific vendor was permanently overstated.

**Fix:** `lib/server/services/supplier-return-service.ts` now inserts a
`credit_note` entry into `supplier_ledger_entries`, reducing that supplier's
running balance by the return's cost — mirroring exactly how
`inventory-supplier-receipt-service.ts` adds an `invoice` entry when goods are
first received.

### 4. Two data bugs in the customer-returns read path (found during the audit)

`lib/server/services/returns-service.ts` queried columns that don't exist on
`medicine_returns`:
- `total_refund_amount` (the real column is `total_return_amount` — that name
  belongs to the unrelated `sales_refunds` table). This broke the returns
  stats endpoint and the min/max amount filter outright (Postgres "column does
  not exist" error) on every call.
- `return_number` in the free-text search columns — that column only exists on
  `supplier_returns`, a different table entirely. Any text search on the
  customer returns list would 400.

**Fix:** corrected both column references. Frontend (`features/returns/*`)
already expected the correct `total_return_amount` name, so no UI changes were
needed — this was purely a server-side bug.

## Verification

- Full chart-of-accounts presence re-checked for all 9 tenants after migration
  81 — every tenant now has the complete 11-account standard set (Default
  Pharmacy retains its pre-existing 22, a superset).
- Dry-run of `create_medicine_return(..., p_status := 'completed')` inside a
  rolled-back transaction confirmed `trg_medicine_returns_accounting` posts a
  balanced voucher (debit total = credit total) before the fix was even
  committed live.
- `npx vitest run` — 67/67 tests pass, including a new regression test
  (`supplier-return-service.test.ts`) asserting the AP subledger entry is a
  `credit_note` that reduces the running balance by the exact return cost.
- `npx tsc --noEmit` — clean across the whole project.

## What's intentionally *not* linked (by design, not a bug)

- Manual journals, bank deposits, cash-shift variance, and reversals are
  user/UI-driven (`journal` voucher type) rather than auto-posted from an
  operational table — that's correct, they don't have a single canonical
  source-of-truth row to trigger off of.
- `medicine_returns`/`supplier_returns` in `pending`/`approved` status
  intentionally post nothing — matching the point stock actually moves
  (`status = 'completed'`). A return that's rejected or still pending approval
  shouldn't touch the books yet.

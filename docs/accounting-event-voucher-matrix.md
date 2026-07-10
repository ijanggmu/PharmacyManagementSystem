# Event → voucher matrix (operational vs GL)

Single source of truth for **financial position and P&L** is **posted `accounting_vouchers` + lines**. Sub-ledgers must reconcile to the related **control accounts** in the GL.

| Business event | Operational tables | Sub-ledger / ops | System voucher type | Typical GL effect | Branch |
|----------------|-------------------|------------------|---------------------|-------------------|--------|
| Sale (cash/bank/card/credit) | `sales`, `sale_items` | `customer_ledger_entries` (credit) | `system_sale` | Dr Cash/Bank/AR; Cr Sales/VAT; Dr COGS / Cr Inventory | `sales.branch_id` |
| Sales refund approved | `sales_refunds` | `customer_ledger_entries` credit_note (credit sales) | `system_sales_return` | Dr 3100; Cr Cash/Bank/AR; optional inventory/COGS | Original sale branch |
| GRN / goods received | `goods_receipts`, items | `supplier_ledger_entries` invoice | `system_purchase` | Dr Inventory, Dr Input VAT; Cr AP (gross) | `goods_receipts.branch_id` |
| Purchase return approved | `supplier_returns` | — | `system_purchase_return` | Dr AP; Cr Inventory | `supplier_returns.branch_id` |
| Supplier payment | `supplier_ledger_entries` payment | same | `system_supplier_payment` | Dr AP; Cr Cash/Bank | User branch / param |
| Customer receipt | `customer_payments` | allocations + ledger | `journal` (customer_payment) | Dr Cash/Bank; Cr AR 1100 | User `current_branch_id` |
| Bank deposit | `bank_deposits` | — | `journal` (bank_deposit) | Dr Bank 1010; Cr Cash 1000 | Selected branch |
| Cash shift variance | `cash_register_shifts` | — | `journal` (cash_shift_variance) | Short: Dr 6100 Cr 1000; Over: Dr 1000 Cr 6100 | Shift branch |
| Manual journal | `accounting_vouchers` draft | — | `journal` | User-defined | User `current_branch_id` |
| Reversal | `accounting_vouchers` | — | `journal` (reversal) | Mirror lines; original → void | Same as original |

## Reconciliation targets

- **AP**: Supplier sub-ledger vs GL 2100 + per-supplier AP heads. Reports support `?branchId=`.
- **AR**: Customer sub-ledger vs GL 1100. Aging prefers `customer_ledger_entries` when present.
- **Inventory**: Stock at cost vs GL 5000 (tenant-wide stock; GL can be branch-filtered).
- **VAT**: GL 2000/1150 vs operational sales tax and GRN VAT.

## Reports (Accounting UI)

- Branch filter on all main GL reports, aging, VAT, reconciliation, cash movement.
- **Trial balance**: optional “Roll up AP supplier heads under 2100”.
- **Voucher register**: branch filter; **Reverse** on posted vouchers (creates reversal journal).
- **Payables**: supplier **Export statement** CSV.
- **Cash & bank**: movement + bank deposit.
- **Cashier** (`/dashboard/cashier`): shift open/close; expected cash from GL cash movement; variance posts on close (migration 65).

## Migrations

| Script | Purpose |
|--------|---------|
| 51–58 | Core GL, auto vouchers, VAT, fiscal lock |
| 63 | Customer AR sub-ledger + receipts |
| 64 | Branch on vouchers, bank deposits, branch on key postings |
| 65 | Remaining postings + credit notes + reversal + cash variance + TB grouping |

Run: `yarn migrate` then reload Supabase API schema if RPC/tables are missing from cache.

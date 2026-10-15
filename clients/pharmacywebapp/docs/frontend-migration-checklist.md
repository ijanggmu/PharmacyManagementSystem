> **Historical:** this document records the completed Supabase → .NET migration and is kept for history only. It does not describe the current architecture. For that, see `../rule.md` and `/docs/adr/0003-nextjs-bff-over-dotnet-api.md`.

# Frontend → .NET migration checklist

Each item is behind its backend flag (default `nextjs`). An item is done only when its dotnet branch
has unit tests and its legacy branch is unchanged. Live testing happens after all items are done.

## Blocked on a product decision (do not start without an answer)
- [ ] **Sales checkout** — .NET takes client unit prices (legacy re-prices server-side), single payment leg only (legacy supports split tender), no discount percent, no interaction/allergy gate.
- [x] **Medicine create/edit** — model extended (unit/cost price, form, strength, supplier, barcode, description, maximum stock, prescription flag) with migrations. Still legacy when the payload uses brand name, dosage, side effects, storage details, units per pack, invoice number or VAT. Clearing maximum stock on update is not supported yet.
- [x] **Settings (key/value)** — generic tenant key/value store with migration; the frontend reads and writes the keys it uses. Category-filtered reads stay legacy.
- [ ] **Dashboard session gating** — dashboard layout and legacy routes still require a Supabase session.

## Ready to build
- [x] Sales list and detail moved (falls back to legacy for search and sort filters). Stats stay legacy (needs a date range and payment counts). Fixed a backend routing bug: sales and prescriptions endpoints were served at a doubled path.
- [x] Returns and refunds: list, detail, create, status and stats moved. Delete stays legacy (no .NET endpoint).
- [x] IRD send and queue health moved. Nothing is sent to CBMS from the frontend; dispatch stays in the backend worker. The IRD sales-register report stays legacy.
- [x] Narcotic register JSON moved. CSV export stays legacy: .NET rows lack prescription number, doctor licence and date of birth, so the dotnet data is not fit for DDA filing yet.
- [x] Onboarding / migration wizard — moved: session, start, opening lines, commit. Needs decision: .NET saves drafts and posts vouchers only on commit (legacy posts per save); one save per category per session.
- [x] Customers: ledger moved (API level, no UI consumer yet). Delete and payments stay legacy: .NET delete has no relation guard; payments need a payment method and GL posting that .NET lacks.
- [x] Suppliers: statement, ledger, cost history, returns create moved. Delete and payments stay legacy (same reasons).
- [~] Purchasing: cancel with reason moved. Create PO, partial receive and reorder UI stay legacy (.NET needs batch and expiry per line; receives full order only; no supplier grouping).
- [x] Inventory: transactions list moved. Stock transfer create, consignment receive/settle and expired list stay legacy (location mapping, missing batch/price fields, money write with no totals).
- [x] Accounting: vouchers list, detail, draft create, post, reverse moved. Void, bank reconciliation, bank deposits, trial balance, GL, balance sheet, P&L, cash movement, VAT and aging stay legacy (missing filters, different sign and field sets).
- [x] Prescriptions: list and refills due stay legacy (missing number, dosage and refill fields).
- [x] Catalog: medicine list, bulk import, recall, archive, unarchive stay legacy (medicine model gaps; delete semantics differ).

## Security and correctness
- [ ] Legacy online checkout sends no idempotency key (double-submit creates two sales)

## Docs
- [ ] Docs repo and changelog entry for the IRD and auth configuration (AGENTS.md rule 10)

## Testing (only after everything above is done)
- [ ] Live smoke test: register, sign in, every migrated list, one write per area

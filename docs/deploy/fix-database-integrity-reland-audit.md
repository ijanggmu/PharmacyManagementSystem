# `fix/database-integrity` — re-land audit

**Audited:** 2026-11-26 · **Against:** `origin/main` @ `12eb94ea` and `origin/release/pilot-1` @ `f4d77cbf`
**Branch tip audited:** `fix/database-integrity` @ `b85da8bf` (2026-10-12), 13 ahead / 341 behind `main`.

## Verdict

**Nothing on `fix/database-integrity` needs re-landing. All 13 commits are already on `main`, every one of
them in a superseding form.** The branch is stale inventory and can be deleted from `origin` as part of the
branch clean-up batch.

No code was ported. No migrations were generated. The deliverable is this audit.

### Why the earlier "49 absent files" measurement was wrong

The gap was measured by diffing **file paths** between the merge base and the branch, then subtracting the
paths present on `main`. Between 2026-10-12 and 2026-11-26 `main` took 341 commits that **renamed the
directories those files live in**, so a path-level diff reports live code as missing:

| Rename on `main` | Effect on the path diff |
|---|---|
| `Modules.X/EventHandlers/` → `Modules.X/IntegrationEventHandlers/` | Every ported event handler looked absent. |
| `Modules.X/Features/{Area}/` → `Modules.X/Features/v1/{Area}/` | Every ported handler/endpoint looked absent. |
| `Modules.X/Data/XRowLocks.cs` → `Modules.X/Services/XRowLocks.cs` | Row-lock helpers looked absent. |
| EF migrations regenerated with new timestamps **and new names** | All 14 migrations looked absent. |
| Helper modules renamed as they were rewritten | `cart-pricing.ts`, `paid-price.ts`, `MoneyBackRules.cs`, … looked absent. |

Two further measurement traps, both real:

- `git cherry` is useless here. The October work was re-landed as **rewritten** commits, not cherry-picks, so
  patch ids never match. Four commits even kept their exact subject line and still show as "ahead".
- Seven of the 14 "absent" migrations are `HardenDataIntegrity` for seven modules. Those are on `main`
  already — ported through `fix/db-integrity-port` (commit `d7149fbd`) and timestamped `20261011191147`…
  `20261011191254` instead of the branch's `20261011103846`…`20261011104201`. `fix/db-integrity-port` is
  **0 commits ahead of `main`**, i.e. fully merged.

## Theme-by-theme decision

Ranked by money-path risk. Every row is **abandon — superseded on `main`**; the evidence column is the
specific artefact on `main` that does the job, so the claim is checkable rather than asserted.

| # | Branch commit | Theme | Superseding implementation on `main` |
|---|---|---|---|
| 1 | `233ac32f` | Harden data integrity across 7 modules (FKs, money/qty precision, indexes) | Ported verbatim-in-intent via `fix/db-integrity-port` `d7149fbd`. Migrations `*/20261011191147…191254_HardenDataIntegrity.cs` for Accounting, Customers, Inventory, Onboarding, Prescriptions, Sales, Suppliers. Plus `MigrationSafetyExtensions` (`a91b674c`) for non-blocking constraint adds, which the October branch did not have. |
| 2 | `e594fc6f` | Batch price is the only selling price; returns pay out through refunds | `CreateSaleCommandHandler.cs:393` prices every line from `BatchDeductionDetail.SellingPrice` through `PriceLevelResolver`, and `:384` refuses a sale whose lot is unpriced (`b.SellingPrice <= 0m`). Backfill migration `Inventory/20261012094656_PriceUnpricedBatchesFromMedicine.cs` replaces the branch's `RepriceBatchesFromMedicinePrice`. Returns settle through `RefundMethods.Settle` (`Features/v1/Returns/CreateReturn/CreateReturnCommandHandler.cs:171`) under a lock on the parent sale, with a combined returned+refunded cap per sale line (`SaleReversals`) — the branch had no such cap. Web: `features/sales/lib/pos-pricing.ts` and `features/returns/lib/return-pricing.ts` (both with tests) replace `cart-pricing.ts` / `paid-price.ts`. |
| 3 | `60800623` | Refunds booked to cash or bank as paid; refunds and receipts counted in the drawer | `Domain/SaleRefund.cs:65-67` carries `SettlementCashAmount` / `SettlementBankAmount`; `Services/CashDrawerCalculator.cs` is the drawer maths. Migration `Sales/20261012094647_SellPerBatchCountCashReceipts.cs` replaces `SplitRefundPayoutCashBank`. `Customers/20261012094652_StoreCustomerPaymentMethod.cs` is the same migration as the branch's `20261012050336_StoreCustomerPaymentMethod`, regenerated 4 h later. |
| 4 | `5bbbc0d2` | Credit limit and loyalty points checked against the live balance inside the sale | `ICustomerSalePostingService` / `CustomerSalePosting` (Customers.Contracts) replaces the branch's `ICustomerSaleAccount`, and `CreateSaleCommandHandler.cs:555` calls `PostSaleAsync` **inside** the sale's transaction. `Customers/Data/CustomerWrites.cs:101` takes `SELECT "Id" … FOR UPDATE` on the customer row, replacing `CustomerRowLocks.cs`. Main's version additionally refuses the redemption rather than silently reducing it, is idempotent per sale, and 409s when the customer turns out inactive under the lock. |
| 5 | `a7b7545c` + `26614702` (Rx half) | Record a prescription dispense inside the sale, with the prescription locked; undo it on cancel/return | `IDispensingSafetyPolicy.ConsumeForSaleAsync` (Prescriptions.Contracts) re-checks under a row lock on the prescription's items and is idempotent per sale; `CreateSaleCommandHandler.cs:127` calls `EnsureDispensableAsync` before the transaction opens and `:566` calls `ConsumeForSaleAsync` inside it. Reversal handlers live at `Prescriptions/IntegrationEventHandlers/{SaleCancelled,ReturnCompleted}IntegrationEventHandler.cs`. Migration `Prescriptions/20261011163150_AddSaleDispenseTrackingAndReversals.cs` replaces `TrackDispensesPerSale`. |
| 6 | `26614702` (Customers half) | Undo cancelled/returned sales on the customer; stop double receipts | `Customers/IntegrationEventHandlers/{SaleCancelled,ReturnCompleted,RefundCompleted}IntegrationEventHandler.cs`. Loyalty reversal carries a `ReversedShare` fraction (`Domain/CustomerLoyaltyEntry.cs:42`, type `EarnReversed`) via migration `Customers/20261011211309_AddLoyaltyReversedShare.cs`, which is strictly richer than the branch's all-or-nothing `ReverseLoyaltyOnCancelAndRefund`. Receipt idempotency is keyed on `ReferenceId`/`OriginalReferenceId` in `IStockReceiptService`. |
| 7 | `45251b5b` | Never void a voucher in a closed period; reverse it today instead | `AccountingPendingReversal` + `VoucherPostingService.RecordPendingReversalAsync` / `ResolveReversalDateAsync` (`Services/VoucherPostingService.cs:382-438`), behind migrations `Accounting/20261011213349_AddPendingReversalsAndPostingLockUniqueness.cs` and `20261013030650_AddPostingLockHistory.cs`. Main dates the reversal into the next open period rather than simply "today", so a closed period keeps reporting what was filed. Integration coverage: `Integration.Tests/Tests/Accounting/AccountingVoucherIntegrityPostgresTests.cs`. |
| 8 | `005aeea2` | Take stock back out of the right batch on GRN voids and supplier returns | `IStockReceiptService.ReverseReceiptAsync` (`:84`) returns per-lot `StockReceiptReversalLineResult`; called from `Purchasing/…/VoidDirectGoodsReceipt/VoidDirectGoodsReceiptCommandHandler.cs:84`, tagged `PurchaseReversal` so it is not mistaken for a sale (`Domain/InventoryTransaction.cs:23`). Integration coverage: `Integration.Tests/Tests/Inventory/InventoryIntegrityPostgresTests.cs`, `DataIntegrityConstraintsPostgresTests.cs`. |
| 9 | `06f146cb` | Bill consignment for stock sold only; keep cancelled and duplicate invoices away from IRD | `Inventory/Services/ConsignedStock.cs` is on `main` and `SettleConsignmentCommandHandler.cs:77` settles from `ConsignedStock.SoldFromLotsAsync`, which excludes cancellations and customer returns. IRD guards are in `Features/v1/Ird/SendIrdInvoice/SendIrdInvoiceCommandHandler.cs:110-134`: only a `Completed` sale is sent, an already-synced sale is never re-sent, and a sale with a `Pending`/`Processing` queue item is refused — all 409. |
| 10 | `26614702` (Inventory half) | Row locks on inventory writes | `Inventory/Services/InventoryRowLocks.cs` (moved from `Data/`). |
| 11 | *(part of `e594fc6f`)* | Activate scheduled prices on a job | `Inventory/Jobs/ApplyDueMedicinePriceSchedulesJob.cs`, plus a whole price-schedule feature the branch never had: `MedicinePriceHistory` domain, `CreateMedicinePriceScheduleCommand`, `CancelMedicinePriceScheduleCommand` and their endpoints. Replaces `ActivateScheduledPricesJob.cs`. |
| 12 | `5d959af7` | Open return and refund details; only offer discard before they post | Same subject on `main` as `8938bf64`. |
| 13 | `cef1d962` | Process customer returns on their own page | Same subject on `main` as `968cd4ed`. |
| 14 | `dfb6d4a7` | Shop currency in sales charts; readable POS figures | Same subject on `main` as `93fb6b6c`. |
| 15 | `b85da8bf` | Fill the supplier edit form; mark inactive when delete is refused | Same subject on `main` as `f4595735`. |

## Tests the branch added that `main` does not have under that filename

All six have an equivalent on `main`; none is a coverage gap worth porting.

| Branch test file | Covered on `main` by |
|---|---|
| `Accounting.Tests/…/VoidInClosedPeriodTests.cs` | `Integration.Tests/Tests/Accounting/AccountingVoucherIntegrityPostgresTests.cs` |
| `Integration.Tests/…/Accounting/VoidInClosedPeriodPostgresTests.cs` | same |
| `Customers.Tests/Features/CustomerSaleAccountTests.cs` | `Customers.Tests` suite against `ICustomerSalePostingService` |
| `Integration.Tests/…/Inventory/StockIntakeRaceTests.cs` | `Integration.Tests/Tests/Inventory/InventoryIntegrityPostgresTests.cs` |
| `Integration.Tests/…/Inventory/StockOutflowPostgresTests.cs` | `Integration.Tests/Tests/Inventory/DataIntegrityConstraintsPostgresTests.cs` |
| `Inventory.Tests/Features/{ActivateScheduledPricesJob,ReceiptReversalAndNamedBatch}Tests.cs` | `Inventory.Tests` suite against `ApplyDueMedicinePriceSchedulesJob` / `ReverseReceiptAsync` |

## Recommended action

1. **Do not merge, cherry-pick or port `fix/database-integrity`.** A merge would conflict across 267 files
   and could only replace better code with worse.
2. **Delete `fix/database-integrity` from `origin`** in the branch clean-up batch, alongside the other
   contained refs. Needs CEO sign-off because it rewrites the remote's branch list.
3. The `fix/database-integrity` row in [`single-vps-runbook.md`](./single-vps-runbook.md) must change from
   **keep — re-land deliberately** to **abandon — already on `main`**, and the branch move into the
   delete-on-sign-off set. That 11-line edit is held in the local commit on this branch and is being applied
   to the runbook on `release/pilot-1` directly, so two branches do not both rewrite one 800-line document.

## Two traps found while doing this, each worth its own ticket

**`docs/release*` is silently un-committable.** `.gitignore` line 27 is the stock VisualStudio
`[Rr]elease/` build-output rule, and it also matches `docs/release/`. Anything written there is refused by
`git add` for no obvious reason, so a document can look saved and never reach the repository. This audit
was first written to `docs/release/` and hit exactly that; it now lives beside the runbook instead. Nothing
has been lost — that directory held only this file. The rule wants two negations
(`!docs/[Rr]elease/`, `!docs/[Rr]eleases/`), but that is a repo-wide `.gitignore` change and does not belong
in an audit branch.

**The agent harness cannot build this repo until it repairs its own environment.** The harness shell starts
with `APPDATA`, `LOCALAPPDATA`, `ProgramData`, `ALLUSERSPROFILE`, `ProgramFiles` and `ProgramFiles(x86)` all
**unset**. NuGet cannot locate its machine-wide config without them, so every `dotnet restore` / `build` /
`test` fails with a bare `NuGet.targets(782,5): error : Value cannot be null. (Parameter 'path1')`, which
looks like a repo problem and is not. Export them before building:

```powershell
$env:APPDATA="$env:USERPROFILE\AppData\Roaming"
$env:LOCALAPPDATA="$env:USERPROFILE\AppData\Local"
$env:ProgramData="C:\ProgramData"
$env:ALLUSERSPROFILE="C:\ProgramData"
$env:ProgramFiles="C:\Program Files"
${env:ProgramFiles(x86)}="C:\Program Files (x86)"
$env:CommonProgramFiles="C:\Program Files\Common Files"
```

Confirm with `dotnet nuget locals all --list`, which must print four paths instead of the same error. The
same shell also has `GIT_AUTHOR_NAME`, `GIT_COMMITTER_NAME` and their e-mail counterparts set to the
**empty string**, which overrides `.git/config` and makes every commit fail with
`fatal: empty ident name (for <>) not allowed`; set all four explicitly before committing.

## Verification run for this audit

On `release/pilot-1` (`f4d77cbf`), in a clean worktree, the five module suites that own the money path:

```
Sales.Tests          Passed! - Failed: 0, Passed: 551, Skipped: 0, Total: 551
Customers.Tests      Passed! - Failed: 0, Passed: 159, Skipped: 0, Total: 159
Inventory.Tests      Passed! - Failed: 0, Passed: 379, Skipped: 0, Total: 379
Accounting.Tests     Passed! - Failed: 0, Passed: 636, Skipped: 0, Total: 636
Prescriptions.Tests  Passed! - Failed: 0, Passed:  83, Skipped: 0, Total:  83
```

1808 tests, 0 failures. This proves the superseding implementations on the release line are green; it does
**not** by itself prove they are behaviourally equivalent to the October branch. That equivalence is the
claim in the table above, evidenced per theme, and is what QA was asked to check independently.

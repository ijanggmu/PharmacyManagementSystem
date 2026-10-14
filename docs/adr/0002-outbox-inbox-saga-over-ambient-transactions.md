# 0002. Outbox/Inbox saga for cross-module workflows, not ambient transactions

- **Status:** Accepted
- **Date:** 2026-09-10
- **Source:** `docs/pharmacy-modules-plan.md` §2, §2.1 (SPIKE-0 verdict), §2.2

## Context

Completing a sale has to deduct stock FEFO (Inventory), check dispensing safety (Prescriptions), save the
sale (Sales), post a balanced GL voucher (Accounting) and, for credit sales, post AR (Customers). Purchasing
receipts and supplier/customer payments have the same shape. Each module owns its own `DbContext` (ADR 0001),
so one `BeginTransaction` does not cover the whole workflow.

The framework has a shared-connection mechanism (`IScopedDbConnectionProvider` +
`AmbientDbTransactionRegistry`). **SPIKE-0** (2026-09-10, against a real Postgres) found that:

1. Two modules' contexts do share one physical `DbConnection`, and passing the `DbTransaction` explicitly
   gives real atomicity across them.
2. The registry's auto-detection did **not** fire for this call pattern. Making it work would need a manually set
   ambient-transaction holder in the protected `src/BuildingBlocks/Persistence`.

## Decision

Do **not** use shared-connection ambient transactions for cross-module workflows. Use the **Outbox + Inbox
integration-event pattern** that already exists in the kit:

- The owning module **commits its own row first**. In the same unit of work it writes an integration event via
  `IOutboxWriter`. It never calls another module's *mutating* service after the local commit.
- **Pre-commit synchronous checks stay** where a rejected operation must never persist: the dispensing-safety
  check, FEFO stock deduction and stock receipt. If the local commit then fails, the handler compensates inline
  (for example `RestockFromCancellationAsync`).
- Downstream effects run in idempotent Inbox consumers on the next Outbox dispatch:

| Publisher | Event | Consumers |
|---|---|---|
| `CreateSaleCommandHandler` | `SaleCompletedIntegrationEvent` | Accounting (voucher), Prescriptions (refill), Customers (AR) |
| `CancelSaleCommandHandler` | `SaleCancelledIntegrationEvent` | Accounting (void), Inventory (restock) |
| `ReceivePurchaseOrderCommandHandler` | `PurchaseOrderReceivedIntegrationEvent` | Suppliers (AP), Accounting |
| `RecordSupplierPaymentCommandHandler` | `SupplierPaymentRecordedIntegrationEvent` | Accounting |
| `RecordCustomerPaymentCommandHandler` | `CustomerPaymentRecordedIntegrationEvent` | Accounting |

Later features (consignment settlement, stock transfers, payroll runs, …) follow the same pattern.

The deciding reason is that the pharmacy modules are candidates for later microservice extraction. A shared
`DbConnection` stops existing as soon as a module gets its own database, so code built on it would have to be
rewritten. Outbox/Inbox handlers keep working when the in-process bus is swapped for a broker.

## Consequences

- **+** Zero changes to `src/BuildingBlocks/Persistence`. Modules stay extractable.
- **+** Consumers are idempotent (Inbox), retried with backoff, and dead-lettered on permanent failure
  (`GetDeadLetteredAsync` / `RedriveDeadLettersAsync`).
- **−** **Eventual consistency:** GL/AR/AP effects land a dispatch cycle after the user sees "done".
- **−** Residual risk windows are accepted by design: a crash between a pre-commit mutation and the local
  commit (compensated inline), and a very small window around the outbox write. A permanently failing consumer
  causes drift. The AR/AP/Inventory-to-GL **reconciliation reports** and the Outbox dead-letter view are how
  drift is detected and fixed.
- **−** No "GL posted?" flag on business documents. Reconciliation relies on reports.

using FSH.Framework.Eventing.Abstractions;

namespace FSH.Modules.Sales.Contracts.Events;

/// <summary>One returned line to restock, carrying the same quantity/cost the return recorded (from
/// the original sale line) — Inventory restocks into a NEW batch dated today, same as
/// <c>SaleCancelledLine</c>, rather than undoing the original batch.</summary>
public sealed record ReturnCompletedLine(Guid MedicineId, decimal Quantity, decimal UnitCostPrice);

/// <summary>
/// Raised the first time a <c>SaleReturn</c> transitions into <c>ReturnStatus.Completed</c>. Consumed
/// by <c>Inventory</c> (restocks each line) and <c>Accounting</c> (posts the reversing voucher: Dr
/// Sales Returns &amp; Allowances / Cr Cash for <paramref name="TotalReturnAmount"/>, plus Dr Inventory
/// / Cr COGS for the returned quantity's cost — mirrors scripts/80-medicine-returns-accounting.sql).
/// Same "async off the Outbox, not an in-process call" shape as <c>SaleCancelledIntegrationEvent</c>.
/// <para><see cref="TotalReturnAmount"/> is VAT-inclusive and valued at the sale lines' after-discount
/// prices. <see cref="VatAmount"/> is the VAT inside it (reversed off VAT Payable). The settlement split
/// (<see cref="CashAmount"/> + <see cref="BankAmount"/> + <see cref="OnAccountAmount"/> = total) says where
/// the money went back: drawer, bank/card/wallet, or the customer's account (Customers credits AR by
/// <see cref="OnAccountAmount"/> and reverses loyalty pro rata of <see cref="SaleTotalAmount"/>).
/// The trailing fields are optional so events already queued still deserialize; when
/// <see cref="VatAmount"/> is null consumers fall back to the old all-cash, VAT-inclusive posting.</para>
/// </summary>
public sealed record ReturnCompletedIntegrationEvent(
    Guid Id,
    DateTime OccurredOnUtc,
    string? TenantId,
    string CorrelationId,
    string Source,
    Guid ReturnId,
    Guid SaleId,
    Guid BranchId,
    decimal TotalReturnAmount,
    IReadOnlyList<ReturnCompletedLine> Lines,
    Guid? CustomerId = null,
    decimal? VatAmount = null,
    decimal CashAmount = 0m,
    decimal BankAmount = 0m,
    decimal OnAccountAmount = 0m,
    decimal SaleTotalAmount = 0m,
    string? RefundMethod = null,
    // Everything returned/refunded of the sale so far, including this return (items value) — consumers
    // reverse loyalty up to ReversedToDateAmount / SaleTotalAmount of the sale.
    decimal ReversedToDateAmount = 0m)
    : IIntegrationEvent;

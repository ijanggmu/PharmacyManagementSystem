using FSH.Framework.Eventing.Abstractions;

namespace FSH.Modules.Sales.Contracts.Events;

/// <summary>
/// Raised the first time a <c>SaleRefund</c> transitions into <c>RefundStatus.Completed</c>. Consumed
/// only by <c>Accounting</c> — a refund never touches physical stock (the Next.js
/// <c>create_sales_refund</c> RPC never calls a restock routine). Posts Dr Sales Returns &amp;
/// Allowances / Cr Cash for <paramref name="NetRefundAmount"/>.
/// <para>With the settlement fields set (newer events): <see cref="GrossRefundAmount"/> is the refunded
/// items' VAT-inclusive, after-discount value (plus any legacy tax add-on); <see cref="VatAmount"/> the VAT
/// inside it; <see cref="NetRefundAmount"/> = gross - <see cref="ProcessingFeeRetained"/> is paid back as
/// <see cref="CashAmount"/> + <see cref="BankAmount"/> + <see cref="OnAccountAmount"/>. Also consumed by
/// <c>Customers</c> (AR credit for <see cref="OnAccountAmount"/>, pro-rata loyalty reversal against
/// <see cref="SaleTotalAmount"/>). Optional so events already queued still deserialize.</para>
/// </summary>
public sealed record RefundCompletedIntegrationEvent(
    Guid Id,
    DateTime OccurredOnUtc,
    string? TenantId,
    string CorrelationId,
    string Source,
    Guid RefundId,
    Guid OriginalSaleId,
    Guid BranchId,
    decimal NetRefundAmount,
    Guid? CustomerId = null,
    decimal? GrossRefundAmount = null,
    decimal? VatAmount = null,
    decimal ProcessingFeeRetained = 0m,
    decimal CashAmount = 0m,
    decimal BankAmount = 0m,
    decimal OnAccountAmount = 0m,
    decimal SaleTotalAmount = 0m,
    // The refunded items' value (VAT-inclusive, after discounts) — what loyalty is reversed against.
    decimal ItemsAmount = 0m,
    string? RefundMethod = null,
    string? CreditNoteNumber = null,
    // Everything returned/refunded of the sale so far, including this refund (items value).
    decimal ReversedToDateAmount = 0m)
    : IIntegrationEvent;

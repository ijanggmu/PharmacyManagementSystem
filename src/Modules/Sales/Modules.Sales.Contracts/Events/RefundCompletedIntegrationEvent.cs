using FSH.Framework.Eventing.Abstractions;

namespace FSH.Modules.Sales.Contracts.Events;

/// <summary>
/// Raised the first time a <c>SaleRefund</c> transitions into <c>RefundStatus.Completed</c>. Consumed
/// only by <c>Accounting</c> — a refund never touches physical stock (the Next.js
/// <c>create_sales_refund</c> RPC never calls a restock routine). Posts Dr Sales Returns &amp;
/// Allowances / Cr Cash for <paramref name="NetRefundAmount"/>.
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
    decimal VatAmount = 0m,
    // Part of NetRefundAmount that reduces what the customer owes instead of being paid out.
    decimal AccountCreditAmount = 0m,
    Guid? CustomerId = null,
    // How the amount paid out (net minus account credit) leaves: from the cash drawer or through the bank.
    // Both 0 on refunds raised before the split was recorded: those post the payout to Cash, as before.
    decimal CashPaidOut = 0m,
    decimal BankPaidOut = 0m)
    : IIntegrationEvent;

using Mediator;

namespace FSH.Modules.Sales.Contracts.v1.Refunds;

/// <summary>
/// Creates a monetary refund against a completed sale. Mirrors <c>POST /api/refunds</c>
/// (app/api/refunds/route.ts) / <c>create_sales_refund</c> (scripts/68).
/// A net refund above the tenant's <c>controls.refund_approval_threshold</c> needs a manager approval bound to the
/// sale (one of <paramref name="ApprovalTokens"/>) unless the caller may approve themselves.
/// </summary>
public sealed record CreateRefundCommand(
    Guid OriginalSaleId,
    Guid? CustomerId,
    DateTime RefundDateUtc,
    string RefundReason,
    IReadOnlyList<RefundItemInput> RefundItems,
    string Status = "pending",
    string RefundType = "partial_refund",
    string RefundMethod = "original_payment",
    decimal TaxRefundAmount = 0m,
    decimal ProcessingFee = 0m,
    string? Notes = null,
    IReadOnlyList<string>? ApprovalTokens = null) : ICommand<Guid>;

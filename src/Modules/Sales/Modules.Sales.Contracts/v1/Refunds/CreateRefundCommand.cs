using Mediator;

namespace FSH.Modules.Sales.Contracts.v1.Refunds;

/// <summary>
/// Creates a money-only refund against a completed sale (no goods coming back — for that, create a
/// return). Mirrors <c>POST /api/refunds</c> (app/api/refunds/route.ts). <paramref name="TaxRefundAmount"/>
/// is IGNORED: prices include VAT, so adding tax on top refunded it twice. It stays for request-shape
/// compatibility with older clients.
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
    string? Notes = null) : ICommand<Guid>;

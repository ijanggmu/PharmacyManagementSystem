using Mediator;

namespace FSH.Modules.Sales.Contracts.v1.Returns;

/// <summary>
/// Creates a customer return against a completed sale. Mirrors <c>POST /api/returns</c>
/// (app/api/returns/route.ts) / <c>create_medicine_return</c> (scripts/68). <paramref name="Status"/>
/// defaults to "pending" like the Next.js Zod schema; passing "completed" restores stock and pays the
/// money back inline with creation, same as the RPC. The money goes back through a refund created with
/// the return (same status, its own credit note), paid by <paramref name="RefundMethod"/>.
/// </summary>
public sealed record CreateReturnCommand(
    Guid SaleId,
    Guid? CustomerId,
    DateTime ReturnDateUtc,
    IReadOnlyList<ReturnItemInput> ReturnItems,
    string Status = "pending",
    string? Reason = null,
    string? Notes = null,
    string RefundMethod = "original_payment") : ICommand<Guid>;

using Mediator;

namespace FSH.Modules.Sales.Contracts.v1.Returns;

/// <summary>
/// Creates a customer return against a completed sale. Mirrors <c>POST /api/returns</c>
/// (app/api/returns/route.ts) / <c>create_medicine_return</c> (scripts/68). <paramref name="Status"/>
/// defaults to "pending" like the Next.js Zod schema; passing "completed" restores stock and posts
/// the reversing voucher inline with creation, same as the RPC.
/// </summary>
public sealed record CreateReturnCommand(
    Guid SaleId,
    Guid? CustomerId,
    DateTime ReturnDateUtc,
    IReadOnlyList<ReturnItemInput> ReturnItems,
    string Status = "pending",
    string? Reason = null,
    string? Notes = null) : ICommand<Guid>;

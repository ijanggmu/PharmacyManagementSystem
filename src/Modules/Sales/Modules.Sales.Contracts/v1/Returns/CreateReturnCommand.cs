using Mediator;

namespace FSH.Modules.Sales.Contracts.v1.Returns;

/// <summary>
/// Creates a customer return against a completed sale. Mirrors <c>POST /api/returns</c>
/// (app/api/returns/route.ts) / <c>create_medicine_return</c> (scripts/68). <paramref name="Status"/>
/// defaults to "pending" like the Next.js Zod schema; passing "completed" restores stock and posts
/// the reversing voucher inline with creation, same as the RPC.
/// <paramref name="RefundMethod"/> says how the money goes back once the return completes: cash
/// (default), original_payment, card/bank/wallet, or store_credit (the customer's account). Whatever the
/// method, a sale still owing on account first has that balance cancelled. The return is recorded at the
/// SALE's branch; the sale's own customer takes precedence over <paramref name="CustomerId"/>.
/// </summary>
public sealed record CreateReturnCommand(
    Guid SaleId,
    Guid? CustomerId,
    DateTime ReturnDateUtc,
    IReadOnlyList<ReturnItemInput> ReturnItems,
    string Status = "pending",
    string? Reason = null,
    string? Notes = null,
    string? RefundMethod = null) : ICommand<Guid>;

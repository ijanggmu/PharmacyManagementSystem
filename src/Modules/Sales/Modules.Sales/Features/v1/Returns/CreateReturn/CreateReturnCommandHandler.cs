using System.Net;
using FSH.Framework.Core.Context;
using FSH.Framework.Core.Exceptions;
using FSH.Framework.Eventing.Abstractions;
using FSH.Modules.Multitenancy.Contracts;
using FSH.Modules.Sales.Contracts.v1.Returns;
using FSH.Modules.Sales.Data;
using FSH.Modules.Sales.Domain;
using FSH.Modules.Sales.Services;
using Mediator;
using Microsoft.EntityFrameworkCore;

namespace FSH.Modules.Sales.Features.v1.Returns.CreateReturn;

/// <summary>
/// Records goods coming back against a completed sale AND the money going back for them. The return
/// carries the goods (restocked when completed — sealed packs only); a refund created with it in the
/// same transaction carries the money: same status, its own IRD credit note, the VAT reversal. Each line
/// is priced at what the customer actually paid per unit (<see cref="SaleItem.PaidUnitPrice"/>, after the
/// line's discount), never a client-supplied figure.
///
/// Limits are shared with stand-alone refunds (<see cref="MoneyBackRules"/>): a sale line's units can be
/// given back only once by either path, and the money paid back never passes the sale total.
///
/// Concurrency: the whole write runs in one transaction that first takes <c>SELECT ... FOR UPDATE</c>
/// on the parent sale row. Concurrent returns or refunds against the same sale serialize on that lock,
/// and the limit sums run after it, so the second writer sees the first one's committed rows.
/// </summary>
public sealed class CreateReturnCommandHandler(
    SalesDbContext dbContext,
    IOutboxWriter outbox,
    ICurrentUser currentUser,
    ICurrentBranch currentBranch,
    IInvoiceNumberService invoiceNumbers) : ICommandHandler<CreateReturnCommand, Guid>
{
    public async ValueTask<Guid> Handle(CreateReturnCommand command, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(command);

        if (!Enum.TryParse<ReturnStatus>(command.Status, ignoreCase: true, out var status))
        {
            throw new CustomException($"Invalid return status '{command.Status}'.", (IEnumerable<string>?)null, HttpStatusCode.BadRequest);
        }

        // A return is processed at a physical branch exactly like the originating sale — treated as
        // REQUIRED, same extension-beyond-the-scope-table reasoning as SaleReturn.BranchId's doc
        // comment. Resolved before the transaction opens (cached on the scope afterwards).
        var branchId = await currentBranch.RequireBranchIdAsync(cancellationToken).ConfigureAwait(false);

        // Branch code for the credit-note number (a Multitenancy read) — before the transaction opens.
        var numberContext = await invoiceNumbers.ResolveContextAsync(branchId, cancellationToken).ConfigureAwait(false);

        return await SalesTransaction.ExecuteAsync(
            dbContext,
            ct => CreateReturnAsync(command, status, branchId, numberContext, ct),
            cancellationToken).ConfigureAwait(false);
    }

    private async ValueTask<Guid> CreateReturnAsync(
        CreateReturnCommand command, ReturnStatus status, Guid branchId, InvoiceNumberContext numberContext,
        CancellationToken cancellationToken)
    {
        // Lock the parent sale BEFORE any limit sum. Other returns/refunds on this sale block here until
        // this transaction ends, then their sums include the rows committed by this one.
        await SalesTransaction.LockSaleRowAsync(dbContext, command.SaleId, cancellationToken).ConfigureAwait(false);

        var sale = await dbContext.Sales
            .Include(s => s.Items)
            .FirstOrDefaultAsync(s => s.Id == command.SaleId, cancellationToken)
            .ConfigureAwait(false)
            ?? throw new NotFoundException($"Sale {command.SaleId} not found.");

        if (sale.Status != SaleStatus.Completed)
        {
            throw new CustomException(
                $"Sale {sale.Id} is {sale.Status}; only a completed sale can be returned against.",
                (IEnumerable<string>?)null, HttpStatusCode.Conflict);
        }

        var saleReturn = SaleReturn.Create(
            branchId, sale.Id, command.CustomerId, command.ReturnDateUtc, status,
            string.IsNullOrWhiteSpace(command.Reason) ? "Not specified" : command.Reason, command.Notes);

        foreach (var input in command.ReturnItems)
        {
            var saleItem = sale.Items.FirstOrDefault(i => i.Id == input.SaleItemId)
                ?? throw new CustomException(
                    $"Sale item {input.SaleItemId} not found on sale {sale.Id}.", (IEnumerable<string>?)null, HttpStatusCode.BadRequest);

            if (!Enum.TryParse<PackagingCondition>(input.PackagingCondition, ignoreCase: true, out var packagingCondition))
            {
                throw new CustomException(
                    $"Invalid packaging condition '{input.PackagingCondition}'.", (IEnumerable<string>?)null, HttpStatusCode.BadRequest);
            }

            // Two lines of this request for the same sale item must fit together, not each on its own.
            decimal inThisReturn = saleReturn.Items.Where(i => i.SaleItemId == saleItem.Id).Sum(i => i.QuantityReturned);
            await MoneyBackRules.EnsureQuantityAvailableAsync(dbContext, saleItem, inThisReturn + input.QuantityReturned, cancellationToken)
                .ConfigureAwait(false);

            saleReturn.AddItem(
                saleItem.Id, saleItem.MedicineId, input.QuantityReturned, saleItem.PaidUnitPrice, saleItem.UnitCostPrice,
                input.Reason, packagingCondition, saleItem.BatchId);
        }

        await MoneyBackRules.EnsureAmountAvailableAsync(dbContext, sale, saleReturn.TotalReturnAmount, cancellationToken)
            .ConfigureAwait(false);

        var payout = await MoneyBackRules.CreateReturnPayoutAsync(
            dbContext, saleReturn, sale, command.RefundMethod, invoiceNumbers, numberContext, cancellationToken).ConfigureAwait(false);

        dbContext.SaleReturns.Add(saleReturn);
        dbContext.SaleRefunds.Add(payout);
        await dbContext.SaveChangesAsync(cancellationToken).ConfigureAwait(false);

        if (status == ReturnStatus.Completed)
        {
            await CompleteAsync(saleReturn, payout, cancellationToken).ConfigureAwait(false);
        }

        return saleReturn.Id;
    }

    private async Task CompleteAsync(SaleReturn saleReturn, SaleRefund payout, CancellationToken cancellationToken)
    {
        bool restock = saleReturn.MarkStockRestoredIfNeeded();
        bool pay = payout.MarkAccountingPostedIfNeeded();
        await dbContext.SaveChangesAsync(cancellationToken).ConfigureAwait(false);

        if (restock)
        {
            await MoneyBackRules.PublishReturnCompletedAsync(outbox, currentUser, saleReturn, moneyRefundedSeparately: true, cancellationToken)
                .ConfigureAwait(false);
        }

        if (pay)
        {
            await MoneyBackRules.PublishRefundCompletedAsync(outbox, currentUser, payout, cancellationToken).ConfigureAwait(false);
        }
    }
}

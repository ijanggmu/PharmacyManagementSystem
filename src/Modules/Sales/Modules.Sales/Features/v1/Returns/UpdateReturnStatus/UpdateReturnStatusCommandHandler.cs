using System.Net;
using FSH.Framework.Core.Context;
using FSH.Framework.Core.Exceptions;
using FSH.Framework.Eventing.Abstractions;
using FSH.Modules.Sales.Contracts.v1.Returns;
using FSH.Modules.Sales.Data;
using FSH.Modules.Sales.Domain;
using FSH.Modules.Sales.Services;
using Mediator;
using Microsoft.EntityFrameworkCore;

namespace FSH.Modules.Sales.Features.v1.Returns.UpdateReturnStatus;

/// <summary>
/// Mirrors <c>PUT /api/returns/{id}</c> (app/api/returns/[id]/route.ts). The return's payout refund
/// moves to the same status with it. Transitioning into "completed" restocks the goods and pays the
/// money back exactly once each (<see cref="SaleReturn.MarkStockRestoredIfNeeded"/>,
/// <see cref="SaleRefund.MarkAccountingPostedIfNeeded"/>). A return recorded before returns paid out
/// through a refund gets its payout refund (and credit note) when it is completed.
/// </summary>
public sealed class UpdateReturnStatusCommandHandler(
    SalesDbContext dbContext,
    IOutboxWriter outbox,
    ICurrentUser currentUser,
    IInvoiceNumberService invoiceNumbers) : ICommandHandler<UpdateReturnStatusCommand, Guid>
{
    public async ValueTask<Guid> Handle(UpdateReturnStatusCommand command, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(command);

        ReturnStatus? newStatus = null;
        if (!string.IsNullOrWhiteSpace(command.Status))
        {
            if (!Enum.TryParse<ReturnStatus>(command.Status, ignoreCase: true, out var parsed))
            {
                throw new CustomException($"Invalid return status '{command.Status}'.", (IEnumerable<string>?)null, HttpStatusCode.BadRequest);
            }

            newStatus = parsed;
        }

        var branchId = await dbContext.SaleReturns.AsNoTracking()
            .Where(r => r.Id == command.ReturnId)
            .Select(r => (Guid?)r.BranchId)
            .FirstOrDefaultAsync(cancellationToken)
            .ConfigureAwait(false)
            ?? throw new NotFoundException($"Return {command.ReturnId} not found.");

        // Branch code for a credit-note number, should completing need a payout — before the transaction.
        var numberContext = await invoiceNumbers.ResolveContextAsync(branchId, cancellationToken).ConfigureAwait(false);

        return await SalesTransaction.ExecuteAsync(
            dbContext,
            ct => UpdateAsync(command, newStatus, numberContext, ct),
            cancellationToken).ConfigureAwait(false);
    }

    private async ValueTask<Guid> UpdateAsync(
        UpdateReturnStatusCommand command, ReturnStatus? newStatus, InvoiceNumberContext numberContext, CancellationToken cancellationToken)
    {
        var saleReturn = await dbContext.SaleReturns
            .Include(r => r.Items)
            .FirstOrDefaultAsync(r => r.Id == command.ReturnId, cancellationToken)
            .ConfigureAwait(false)
            ?? throw new NotFoundException($"Return {command.ReturnId} not found.");

        var payout = await dbContext.SaleRefunds
            .Include(r => r.Items)
            .FirstOrDefaultAsync(r => r.ReturnId == saleReturn.Id, cancellationToken)
            .ConfigureAwait(false);

        if (newStatus is { } status)
        {
            saleReturn.SetStatus(status);
            payout?.SetStatus(MoneyBackRules.ToRefundStatus(status));
        }

        saleReturn.UpdateDetails(command.Reason, command.Notes);

        if (newStatus == ReturnStatus.Completed && payout is null)
        {
            await SalesTransaction.LockSaleRowAsync(dbContext, saleReturn.SaleId, cancellationToken).ConfigureAwait(false);
            var sale = await dbContext.Sales
                .Include(s => s.Items)
                .Include(s => s.Payments)
                .FirstAsync(s => s.Id == saleReturn.SaleId, cancellationToken)
                .ConfigureAwait(false);

            payout = await MoneyBackRules.CreateReturnPayoutAsync(
                dbContext, saleReturn, sale, "original_payment", invoiceNumbers, numberContext, cancellationToken).ConfigureAwait(false);
            dbContext.SaleRefunds.Add(payout);
        }

        await dbContext.SaveChangesAsync(cancellationToken).ConfigureAwait(false);

        if (newStatus == ReturnStatus.Completed && payout is not null)
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

        return saleReturn.Id;
    }
}

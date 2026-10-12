using System.Net;
using FSH.Framework.Core.Context;
using FSH.Framework.Core.Exceptions;
using FSH.Framework.Eventing.Abstractions;
using FSH.Modules.Multitenancy.Contracts;
using FSH.Modules.Sales.Contracts.v1.Refunds;
using FSH.Modules.Sales.Data;
using FSH.Modules.Sales.Domain;
using FSH.Modules.Sales.Services;
using Mediator;
using Microsoft.EntityFrameworkCore;

namespace FSH.Modules.Sales.Features.v1.Refunds.CreateRefund;

/// <summary>
/// Money back without goods coming back (an overcharge, a damaged or expired item the customer keeps).
/// When goods come back, record a return instead — it creates its own payout refund. Each line is
/// priced at what the customer actually paid per unit (<see cref="SaleItem.PaidUnitPrice"/>, after the
/// line's discount). Prices include VAT, so nothing is added for tax; the VAT inside the refunded amount
/// is split out on the credit note and reversed in the books.
///
/// Limits are shared with returns (<see cref="MoneyBackRules"/>): a sale line's units can be given back
/// only once by either path, and the money paid back never passes the sale total. A refund never
/// restocks.
///
/// Concurrency: the write runs in one transaction that first takes <c>SELECT ... FOR UPDATE</c> on the
/// parent sale row, so concurrent refunds (and returns) against the same sale serialize and the caps
/// are checked against committed state.
/// </summary>
public sealed class CreateRefundCommandHandler(
    SalesDbContext dbContext,
    IOutboxWriter outbox,
    ICurrentUser currentUser,
    ICurrentBranch currentBranch,
    IInvoiceNumberService invoiceNumbers) : ICommandHandler<CreateRefundCommand, Guid>
{
    public async ValueTask<Guid> Handle(CreateRefundCommand command, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(command);

        if (!Enum.TryParse<RefundStatus>(command.Status, ignoreCase: true, out var status))
        {
            throw new CustomException($"Invalid refund status '{command.Status}'.", (IEnumerable<string>?)null, HttpStatusCode.BadRequest);
        }

        // A refund is processed at a physical branch exactly like the originating sale — treated as
        // REQUIRED, same extension-beyond-the-scope-table reasoning as SaleRefund.BranchId's doc
        // comment. Resolved before the transaction opens (cached on the scope afterwards).
        var branchId = await currentBranch.RequireBranchIdAsync(cancellationToken).ConfigureAwait(false);

        // Branch code for the credit-note number (a Multitenancy read) — before the transaction opens.
        var numberContext = await invoiceNumbers.ResolveContextAsync(branchId, cancellationToken).ConfigureAwait(false);

        return await SalesTransaction.ExecuteAsync(
            dbContext,
            ct => CreateRefundAsync(command, status, branchId, numberContext, ct),
            cancellationToken).ConfigureAwait(false);
    }

    private async ValueTask<Guid> CreateRefundAsync(
        CreateRefundCommand command, RefundStatus status, Guid branchId, InvoiceNumberContext numberContext,
        CancellationToken cancellationToken)
    {
        // Lock the parent sale BEFORE any "already refunded" sum (see SalesTransaction.LockSaleRowAsync).
        await SalesTransaction.LockSaleRowAsync(dbContext, command.OriginalSaleId, cancellationToken).ConfigureAwait(false);

        var sale = await dbContext.Sales
            .Include(s => s.Items)
            .Include(s => s.Payments)
            .FirstOrDefaultAsync(s => s.Id == command.OriginalSaleId, cancellationToken)
            .ConfigureAwait(false)
            ?? throw new NotFoundException($"Sale {command.OriginalSaleId} not found.");

        if (sale.Status != SaleStatus.Completed)
        {
            throw new CustomException(
                $"Sale {sale.Id} is {sale.Status}; only a completed sale can be refunded.",
                (IEnumerable<string>?)null, HttpStatusCode.Conflict);
        }

        var refund = SaleRefund.Create(
            // The sale's customer is authoritative: theirs is the account a refund can credit.
            branchId, sale.Id, sale.CustomerId ?? command.CustomerId, command.RefundDateUtc, status, command.RefundReason,
            command.RefundType, command.RefundMethod, command.ProcessingFee, command.Notes);

        foreach (var input in command.RefundItems)
        {
            var saleItem = sale.Items.FirstOrDefault(i => i.Id == input.SaleItemId)
                ?? throw new CustomException(
                    $"Sale item {input.SaleItemId} not found on sale {sale.Id}.", (IEnumerable<string>?)null, HttpStatusCode.BadRequest);

            decimal inThisRefund = refund.Items.Where(i => i.SaleItemId == saleItem.Id).Sum(i => i.QuantityRefunded);
            await MoneyBackRules.EnsureQuantityAvailableAsync(dbContext, saleItem, inThisRefund + input.QuantityRefunded, cancellationToken)
                .ConfigureAwait(false);

            refund.AddItem(saleItem.Id, saleItem.MedicineId, input.QuantityRefunded, saleItem.PaidUnitPrice);
        }

        await MoneyBackRules.EnsureAmountAvailableAsync(dbContext, sale, refund.NetRefundAmount, cancellationToken)
            .ConfigureAwait(false);
        await MoneyBackRules.AssignCreditNoteAsync(refund, sale, invoiceNumbers, numberContext, cancellationToken)
            .ConfigureAwait(false);
        await MoneyBackRules.ApplyAccountCreditAsync(dbContext, refund, sale, cancellationToken).ConfigureAwait(false);
        MoneyBackRules.ApplyPayoutSplit(refund, sale);

        dbContext.SaleRefunds.Add(refund);
        await dbContext.SaveChangesAsync(cancellationToken).ConfigureAwait(false);

        if (status == RefundStatus.Completed && refund.MarkAccountingPostedIfNeeded())
        {
            await dbContext.SaveChangesAsync(cancellationToken).ConfigureAwait(false);
            await MoneyBackRules.PublishRefundCompletedAsync(outbox, currentUser, refund, cancellationToken).ConfigureAwait(false);
        }

        return refund.Id;
    }
}

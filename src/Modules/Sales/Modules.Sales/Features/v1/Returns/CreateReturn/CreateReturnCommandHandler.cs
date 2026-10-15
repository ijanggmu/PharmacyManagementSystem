using System.Net;
using FSH.Framework.Core.Context;
using FSH.Framework.Core.Exceptions;
using FSH.Framework.Eventing.Abstractions;
using FSH.Modules.Multitenancy.Contracts;
using FSH.Modules.Sales.Contracts.v1.Returns;
using FSH.Modules.Sales.Data;
using FSH.Modules.Sales.Domain;
using FSH.Modules.Sales.Features.v1.Shared;
using FSH.Modules.Sales.Services;
using Mediator;
using Microsoft.EntityFrameworkCore;

namespace FSH.Modules.Sales.Features.v1.Returns.CreateReturn;

/// <summary>
/// Ports <c>create_medicine_return</c> (scripts/68-returns-refunds-integrity.sql): the sale must
/// exist and be completed (not cancelled), each line must reference a real item on that sale, and ONE
/// combined cap per sale line covers returns and refunds together (see <see cref="SaleReversals"/>) — a
/// line can't be both returned and refunded past what was sold. Each line is valued at the sale line's
/// after-discount total pro rata — never a client-supplied figure, and never the pre-discount list price.
/// If created directly with status "completed", stock is restored and the reversing voucher posted the
/// same as a later status-update transition into "completed" would do (<see cref="SaleReversals.CompleteReturnAsync"/>).
///
/// The return is stamped with the SALE's branch (and the caller must be able to see that branch), so it
/// is reported, restocked and posted where the goods were sold. It must also be PROCESSED there: a caller
/// working at another branch gets 409 and switches to the sale's branch first (the goods go back on that
/// branch's shelf and any cash leaves that branch's drawer, so recording it from elsewhere would misstate
/// both branches).
///
/// Completed returns get a sequential IRD credit-note number (<see cref="SaleReversals.CompleteReturnAsync"/>).
/// Sales recorded before the VAT breakdown was stored are reversed at the tenant's current VAT rate.
///
/// Created completed, the money goes back at once, so what is paid out in cash or to the bank is held to the refund
/// approval threshold (<see cref="EnsurePayoutApprovedAsync"/>), and cash needs an open cash shift when the tenant
/// requires one (<see cref="CashDrawerGuard"/>).
///
/// Concurrency: the whole write runs in one transaction that first takes <c>SELECT ... FOR UPDATE</c>
/// on the parent sale row. Concurrent returns, refunds and cancellations of the same sale serialize on
/// that lock, and the "already returned/refunded" sums run after it.
/// </summary>
public sealed class CreateReturnCommandHandler(
    SalesDbContext dbContext,
    IOutboxWriter outbox,
    ICurrentUser currentUser,
    ICurrentBranch currentBranch,
    IMediator mediator,
    IInvoiceNumberService invoiceNumbers,
    ISaleControls saleControls) : ICommandHandler<CreateReturnCommand, Guid>
{
    public async ValueTask<Guid> Handle(CreateReturnCommand command, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(command);

        if (!Enum.TryParse<ReturnStatus>(command.Status, ignoreCase: true, out var status))
        {
            throw new CustomException($"Invalid return status '{command.Status}'.", (IEnumerable<string>?)null, HttpStatusCode.BadRequest);
        }

        // Branch visibility is checked before the transaction opens (it may read other modules on the
        // shared connection); the sale's branch is re-read under the lock below.
        var header = await dbContext.Sales.AsNoTracking()
            .Where(s => s.Id == command.SaleId)
            .Select(s => new { s.BranchId, s.CustomerId })
            .FirstOrDefaultAsync(cancellationToken)
            .ConfigureAwait(false)
            ?? throw new NotFoundException($"Sale {command.SaleId} not found.");

        await currentBranch.EnsureCanSeeBranchAsync(header.BranchId, $"Sale {command.SaleId} not found.", cancellationToken)
            .ConfigureAwait(false);
        await SaleReversals.EnsureAtSaleBranchAsync(currentBranch, header.BranchId, "return", cancellationToken).ConfigureAwait(false);

        // Refund approval threshold and the open-shift rule (tenant settings) — read before the transaction opens.
        await saleControls.PreloadAsync(cancellationToken).ConfigureAwait(false);

        var context = await SaleReversals.PrepareAsync(
                mediator, invoiceNumbers, saleControls, header.BranchId, header.CustomerId, completing: status == ReturnStatus.Completed, cancellationToken)
            .ConfigureAwait(false);

        return await SalesTransaction.ExecuteAsync(
            dbContext,
            ct => CreateReturnAsync(command, status, context, ct),
            cancellationToken).ConfigureAwait(false);
    }

    private async ValueTask<Guid> CreateReturnAsync(
        CreateReturnCommand command, ReturnStatus status, ReversalContext context, CancellationToken cancellationToken)
    {
        // Lock the parent sale BEFORE any "already returned" sum. Other returns/refunds/cancellations of this
        // sale block here until this transaction ends.
        await SalesTransaction.LockSaleRowAsync(dbContext, command.SaleId, cancellationToken).ConfigureAwait(false);

        var sale = await dbContext.Sales
            .Include(s => s.Items)
            .Include(s => s.Payments)
            .FirstOrDefaultAsync(s => s.Id == command.SaleId, cancellationToken)
            .ConfigureAwait(false)
            ?? throw new NotFoundException($"Sale {command.SaleId} not found.");

        SaleReversals.EnsureReversible(sale, "return");

        var saleReturn = SaleReturn.Create(
            sale.BranchId, sale.Id, sale.CustomerId ?? command.CustomerId, command.ReturnDateUtc, status,
            string.IsNullOrWhiteSpace(command.Reason) ? "Not specified" : command.Reason, command.Notes,
            command.RefundMethod);

        var consumption = await SaleReversals.LoadLineConsumptionAsync(dbContext, sale.Id, cancellationToken).ConfigureAwait(false);

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

            decimal lineAmount = SaleReversals.TakeLine(saleItem, input.QuantityReturned, consumption, "returned");

            saleReturn.AddItem(
                saleItem.Id, saleItem.MedicineId, input.QuantityReturned, saleItem.EffectiveUnitPrice, saleItem.UnitCostPrice,
                input.Reason, packagingCondition, lineAmount);
        }

        var isTaxable = sale.Items.ToDictionary(i => i.Id, i => i.IsTaxable);
        var vat = VatBreakdown.Compute(
            sale.VatRatePercent,
            saleReturn.Items.Select(i => (i.TotalAmount, isTaxable.GetValueOrDefault(i.SaleItemId, true))),
            context.TenantVatRatePercent);
        // The return that gives back the last of the sale takes the VAT the sale has left (no paisa stranded).
        if (vat is not null
            && await SaleReversals.ResidualVatAsync(dbContext, sale, consumption, cancellationToken).ConfigureAwait(false) is { } residualVat)
        {
            vat = vat.WithVat(residualVat);
        }

        saleReturn.ApplyVatBreakdown(vat);

        if (status == ReturnStatus.Completed)
        {
            await EnsurePayoutApprovedAsync(command, sale, saleReturn, context, cancellationToken).ConfigureAwait(false);
        }

        dbContext.SaleReturns.Add(saleReturn);
        await dbContext.SaveChangesAsync(cancellationToken).ConfigureAwait(false);

        if (status == ReturnStatus.Completed)
        {
            await SaleReversals.CompleteReturnAsync(
                    dbContext, outbox, invoiceNumbers, context, currentUser.GetTenant(), sale, saleReturn, cancellationToken)
                .ConfigureAwait(false);
        }

        return saleReturn.Id;
    }

    /// <summary>
    /// A return created completed pays out at once (the counter flow — a pending return is completed later by someone
    /// holding <c>Returns.Update</c>). The money that leaves the business — cash from the drawer and bank/card/wallet
    /// transfers; not what is credited to the customer's account — is held to the refund approval threshold exactly
    /// like a refund: above it, a caller who can't approve themselves needs a manager approval bound to the sale. Runs
    /// after every cap check, inside the transaction, so a refused return doesn't spend the approval.
    /// </summary>
    private async ValueTask EnsurePayoutApprovedAsync(
        CreateReturnCommand command, Sale sale, SaleReturn saleReturn, ReversalContext context, CancellationToken cancellationToken)
    {
        decimal credited = await SaleReversals.OnAccountAlreadyCreditedAsync(dbContext, sale.Id, cancellationToken).ConfigureAwait(false);
        var settlement = RefundMethods.Settle(sale, saleReturn.TotalReturnAmount, saleReturn.RefundMethod, credited, context.CustomerOpenBalance);
        await saleControls.EnsureRefundAllowedAsync(sale.Id, settlement.Cash + settlement.Bank, command.ApprovalTokens, cancellationToken)
            .ConfigureAwait(false);
    }
}

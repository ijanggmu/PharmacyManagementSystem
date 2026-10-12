using System.Net;
using FSH.Framework.Core.Context;
using FSH.Framework.Core.Exceptions;
using FSH.Framework.Eventing.Abstractions;
using FSH.Modules.Multitenancy.Contracts;
using FSH.Modules.Sales.Contracts.v1.Refunds;
using FSH.Modules.Sales.Data;
using FSH.Modules.Sales.Domain;
using FSH.Modules.Sales.Features.v1.Shared;
using FSH.Modules.Sales.Services;
using Mediator;
using Microsoft.EntityFrameworkCore;

namespace FSH.Modules.Sales.Features.v1.Refunds.CreateRefund;

/// <summary>
/// Ports <c>create_sales_refund</c> (scripts/68-returns-refunds-integrity.sql): the sale must exist and be
/// completed (not cancelled), each line must reference a real item on that sale, and ONE combined cap per
/// sale line covers refunds AND returns (<see cref="SaleReversals"/> — the legacy SQL kept two separate
/// caps, which let a line be both fully returned and fully refunded). The refund-level cap keeps the
/// cumulative net refunded within the sale total. A refund never restocks — it is purely financial.
///
/// Amounts: each line is valued at the sale line's after-discount total pro rata. Prices are
/// VAT-inclusive, so the VAT is carved out of the refunded lines (<see cref="SaleRefund.ApplyVatBreakdown"/>)
/// rather than added on top — <see cref="CreateRefundCommand.TaxRefundAmount"/> must be 0 (validator).
///
/// The refund is stamped with the SALE's branch (credit-note series of that branch), the caller must be able
/// to see it, and must be working at it (409 otherwise; see <see cref="SaleReversals.EnsureAtSaleBranchAsync"/>).
///
/// The sequential IRD credit-note number is assigned when the refund COMPLETES
/// (<see cref="SaleReversals.CompleteRefundAsync"/>), so a pending refund later rejected or deleted never burns
/// a number. Sales recorded before the VAT breakdown was stored are reversed at the tenant's current VAT rate.
///
/// Concurrency: the write runs in one transaction that first takes <c>SELECT ... FOR UPDATE</c> on the
/// parent sale row, so concurrent refunds, returns and cancellations of the same sale serialize and the
/// caps are checked against committed state.
/// </summary>
public sealed class CreateRefundCommandHandler(
    SalesDbContext dbContext,
    IOutboxWriter outbox,
    ICurrentUser currentUser,
    ICurrentBranch currentBranch,
    IInvoiceNumberService invoiceNumbers,
    IMediator mediator) : ICommandHandler<CreateRefundCommand, Guid>
{
    public async ValueTask<Guid> Handle(CreateRefundCommand command, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(command);

        if (!Enum.TryParse<RefundStatus>(command.Status, ignoreCase: true, out var status))
        {
            throw new CustomException($"Invalid refund status '{command.Status}'.", (IEnumerable<string>?)null, HttpStatusCode.BadRequest);
        }

        // The sale's branch: visibility check and credit-note numbering context are cross-module reads,
        // done before the transaction opens.
        var header = await dbContext.Sales.AsNoTracking()
            .Where(s => s.Id == command.OriginalSaleId)
            .Select(s => new { s.BranchId, s.CustomerId })
            .FirstOrDefaultAsync(cancellationToken)
            .ConfigureAwait(false)
            ?? throw new NotFoundException($"Sale {command.OriginalSaleId} not found.");

        await currentBranch.EnsureCanSeeBranchAsync(header.BranchId, $"Sale {command.OriginalSaleId} not found.", cancellationToken)
            .ConfigureAwait(false);
        await SaleReversals.EnsureAtSaleBranchAsync(currentBranch, header.BranchId, "refund", cancellationToken).ConfigureAwait(false);

        var context = await SaleReversals.PrepareAsync(
                mediator, invoiceNumbers, header.BranchId, header.CustomerId, completing: status == RefundStatus.Completed, cancellationToken)
            .ConfigureAwait(false);

        return await SalesTransaction.ExecuteAsync(
            dbContext,
            ct => CreateRefundAsync(command, status, context, ct),
            cancellationToken).ConfigureAwait(false);
    }

    private async ValueTask<Guid> CreateRefundAsync(
        CreateRefundCommand command, RefundStatus status, ReversalContext context, CancellationToken cancellationToken)
    {
        // Lock the parent sale BEFORE any "already refunded" sum (see SalesTransaction.LockSaleRowAsync).
        await SalesTransaction.LockSaleRowAsync(dbContext, command.OriginalSaleId, cancellationToken).ConfigureAwait(false);

        var sale = await dbContext.Sales
            .Include(s => s.Items)
            .Include(s => s.Payments)
            .FirstOrDefaultAsync(s => s.Id == command.OriginalSaleId, cancellationToken)
            .ConfigureAwait(false)
            ?? throw new NotFoundException($"Sale {command.OriginalSaleId} not found.");

        SaleReversals.EnsureReversible(sale, "refund");

        // VAT is inside the (VAT-inclusive) line amounts; nothing is added on top (TaxRefundAmount = 0).
        var refund = SaleRefund.Create(
            sale.BranchId, sale.Id, sale.CustomerId ?? command.CustomerId, command.RefundDateUtc, status, command.RefundReason,
            command.RefundType, command.RefundMethod, taxRefundAmount: 0m, command.ProcessingFee, command.Notes);

        var consumption = await SaleReversals.LoadLineConsumptionAsync(dbContext, sale.Id, cancellationToken).ConfigureAwait(false);

        foreach (var input in command.RefundItems)
        {
            var saleItem = sale.Items.FirstOrDefault(i => i.Id == input.SaleItemId)
                ?? throw new CustomException(
                    $"Sale item {input.SaleItemId} not found on sale {sale.Id}.", (IEnumerable<string>?)null, HttpStatusCode.BadRequest);

            decimal lineAmount = SaleReversals.TakeLine(saleItem, input.QuantityRefunded, consumption, "refunded");
            refund.AddItem(saleItem.Id, saleItem.MedicineId, input.QuantityRefunded, saleItem.EffectiveUnitPrice, lineAmount);
        }

        // Refund-level cap: the sale's total amount is the ceiling on cumulative net refunds.
        // NetRefundAmount is computed over each refund's Items, so existing refunds are materialized.
        var existingRefunds = await dbContext.SaleRefunds
            .AsNoTracking()
            .Include(r => r.Items)
            .Where(r => r.OriginalSaleId == sale.Id && r.Status != RefundStatus.Rejected)
            .ToListAsync(cancellationToken)
            .ConfigureAwait(false);
        decimal alreadyRefundedNet = existingRefunds.Sum(r => r.NetRefundAmount);
        decimal saleTotal = Money.Round(sale.TotalAmount);

        if (alreadyRefundedNet + refund.NetRefundAmount > saleTotal)
        {
            throw new CustomException(
                $"Refund of {refund.NetRefundAmount} would exceed the remaining refundable balance " +
                $"({alreadyRefundedNet} already refunded of {saleTotal} sale total).",
                (IEnumerable<string>?)null, HttpStatusCode.Conflict);
        }

        // The VAT breakdown of the refunded lines comes from the original sale's rate (the tenant's current rate
        // for sales recorded before it was stored) and each line's VAT status. The credit-note number is
        // assigned at completion.
        refund.ApplyVatBreakdown(sale.VatRatePercent ?? context.TenantVatRatePercent, sale.Items.ToDictionary(i => i.Id, i => i.IsTaxable));

        dbContext.SaleRefunds.Add(refund);
        await dbContext.SaveChangesAsync(cancellationToken).ConfigureAwait(false);

        if (status == RefundStatus.Completed)
        {
            await SaleReversals.CompleteRefundAsync(
                    dbContext, outbox, invoiceNumbers, context, currentUser.GetTenant(), sale, refund, cancellationToken)
                .ConfigureAwait(false);
        }

        return refund.Id;
    }
}

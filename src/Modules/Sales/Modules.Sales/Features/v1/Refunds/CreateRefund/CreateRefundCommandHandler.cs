using System.Diagnostics;
using System.Net;
using FSH.Framework.Core.Context;
using FSH.Framework.Core.Exceptions;
using FSH.Framework.Eventing.Abstractions;
using FSH.Modules.Multitenancy.Contracts;
using FSH.Modules.Sales.Contracts.Events;
using FSH.Modules.Sales.Contracts.Fiscal;
using FSH.Modules.Sales.Contracts.v1.Refunds;
using FSH.Modules.Sales.Data;
using FSH.Modules.Sales.Domain;
using FSH.Modules.Sales.Services;
using Mediator;
using Microsoft.EntityFrameworkCore;

namespace FSH.Modules.Sales.Features.v1.Refunds.CreateRefund;

/// <summary>
/// Ports <c>create_sales_refund</c> (scripts/68-returns-refunds-integrity.sql): the sale must exist,
/// each line must reference a real item on that sale, the per-line cap sums quantity already refunded
/// against that sale line across every non-rejected refund (a SEPARATE cap from Returns' — the
/// original SQL never cross-checks <c>return_items</c> against <c>sales_refund_items</c>, so a line
/// can be both fully returned AND fully refunded; ported as-is, not "fixed", to stay faithful to the
/// source), and the refund-level cap ensures the sum of net amounts already refunded (non-rejected)
/// plus this one never exceeds the sale's total amount ("refund amount cannot exceed sale amount").
/// A refund never restocks — it is purely financial (see <see cref="SaleRefund"/> doc comment).
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
            .FirstOrDefaultAsync(s => s.Id == command.OriginalSaleId, cancellationToken)
            .ConfigureAwait(false)
            ?? throw new NotFoundException($"Sale {command.OriginalSaleId} not found.");

        var refund = SaleRefund.Create(
            branchId, sale.Id, command.CustomerId, command.RefundDateUtc, status, command.RefundReason,
            command.RefundType, command.RefundMethod, command.TaxRefundAmount, command.ProcessingFee, command.Notes);

        foreach (var input in command.RefundItems)
        {
            var saleItem = sale.Items.FirstOrDefault(i => i.Id == input.SaleItemId)
                ?? throw new CustomException(
                    $"Sale item {input.SaleItemId} not found on sale {sale.Id}.", (IEnumerable<string>?)null, HttpStatusCode.BadRequest);

            decimal alreadyRefundedQty = await (
                from ri in dbContext.SaleRefundItems
                join sr in dbContext.SaleRefunds on ri.SaleRefundId equals sr.Id
                where ri.SaleItemId == input.SaleItemId && sr.Status != RefundStatus.Rejected
                select ri.QuantityRefunded)
                .SumAsync(cancellationToken)
                .ConfigureAwait(false);

            if (alreadyRefundedQty + input.QuantityRefunded > saleItem.Quantity)
            {
                throw new CustomException(
                    $"Cannot refund {input.QuantityRefunded} units of sale item {input.SaleItemId} — " +
                    $"{alreadyRefundedQty} of {saleItem.Quantity} already refunded/sold.",
                    (IEnumerable<string>?)null, HttpStatusCode.Conflict);
            }

            refund.AddItem(saleItem.Id, saleItem.MedicineId, input.QuantityRefunded, saleItem.UnitPrice);
        }

        // Refund-level cap: the sale's total amount is the ceiling on cumulative net refunds
        // ("refund amount cannot exceed sale amount").
        // NetRefundAmount is a computed (unmapped) property over each refund's Items collection, so
        // the existing refunds must be materialized with their items before it can be evaluated —
        // it cannot be translated into the SQL query itself.
        var existingRefunds = await dbContext.SaleRefunds
            .AsNoTracking()
            .Include(r => r.Items)
            .Where(r => r.OriginalSaleId == sale.Id && r.Status != RefundStatus.Rejected)
            .ToListAsync(cancellationToken)
            .ConfigureAwait(false);
        decimal alreadyRefundedNet = existingRefunds.Sum(r => r.NetRefundAmount);

        if (alreadyRefundedNet + refund.NetRefundAmount > sale.TotalAmount)
        {
            throw new CustomException(
                $"Refund of {refund.NetRefundAmount} would exceed the remaining refundable balance " +
                $"({alreadyRefundedNet} already refunded of {sale.TotalAmount} sale total).",
                (IEnumerable<string>?)null, HttpStatusCode.Conflict);
        }

        // IRD credit note: sequential per branch and Nepali fiscal year (its own CN series), reserved on
        // this transaction so a rejected refund releases the number. The VAT breakdown of the refunded
        // lines comes from the original sale's rate and each line's VAT status.
        refund.ApplyVatBreakdown(sale.VatRatePercent, sale.Items.ToDictionary(i => i.Id, i => i.IsTaxable));
        int fiscalYear = NepalFiscalYear.StartYearFor(command.RefundDateUtc);
        int sequence = await invoiceNumbers.ReserveNextCreditNoteAsync(branchId, fiscalYear, cancellationToken).ConfigureAwait(false);
        refund.AssignCreditNote(InvoiceNumberService.FormatCreditNote(numberContext, fiscalYear, sequence), fiscalYear);

        dbContext.SaleRefunds.Add(refund);
        await dbContext.SaveChangesAsync(cancellationToken).ConfigureAwait(false);

        if (status == RefundStatus.Completed && refund.MarkAccountingPostedIfNeeded())
        {
            await dbContext.SaveChangesAsync(cancellationToken).ConfigureAwait(false);
            await PublishRefundCompletedAsync(refund, cancellationToken).ConfigureAwait(false);
        }

        return refund.Id;
    }

    private async Task PublishRefundCompletedAsync(SaleRefund refund, CancellationToken cancellationToken)
    {
        string correlationId = Activity.Current?.Id ?? Guid.NewGuid().ToString();
        await outbox.AddAsync(new RefundCompletedIntegrationEvent(
            Id: Guid.NewGuid(),
            OccurredOnUtc: DateTime.UtcNow,
            TenantId: currentUser.GetTenant(),
            CorrelationId: correlationId,
            Source: "Sales",
            RefundId: refund.Id,
            OriginalSaleId: refund.OriginalSaleId,
            BranchId: refund.BranchId,
            NetRefundAmount: refund.NetRefundAmount),
            cancellationToken).ConfigureAwait(false);
    }
}

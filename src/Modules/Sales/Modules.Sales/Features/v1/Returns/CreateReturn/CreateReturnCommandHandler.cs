using System.Net;
using FSH.Framework.Core.Context;
using FSH.Framework.Core.Exceptions;
using FSH.Framework.Eventing.Abstractions;
using FSH.Modules.Multitenancy.Contracts;
using FSH.Modules.Sales.Contracts.v1.Returns;
using FSH.Modules.Sales.Data;
using FSH.Modules.Sales.Domain;
using FSH.Modules.Sales.Features.v1.Shared;
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
/// is reported, restocked and posted where the goods were sold.
///
/// Concurrency: the whole write runs in one transaction that first takes <c>SELECT ... FOR UPDATE</c>
/// on the parent sale row. Concurrent returns, refunds and cancellations of the same sale serialize on
/// that lock, and the "already returned/refunded" sums run after it.
/// </summary>
public sealed class CreateReturnCommandHandler(
    SalesDbContext dbContext,
    IOutboxWriter outbox,
    ICurrentUser currentUser,
    ICurrentBranch currentBranch) : ICommandHandler<CreateReturnCommand, Guid>
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
        Guid saleBranchId = await dbContext.Sales.AsNoTracking()
            .Where(s => s.Id == command.SaleId)
            .Select(s => s.BranchId)
            .FirstOrDefaultAsync(cancellationToken)
            .ConfigureAwait(false);
        if (saleBranchId == Guid.Empty)
        {
            throw new NotFoundException($"Sale {command.SaleId} not found.");
        }

        await currentBranch.EnsureCanSeeBranchAsync(saleBranchId, $"Sale {command.SaleId} not found.", cancellationToken)
            .ConfigureAwait(false);

        return await SalesTransaction.ExecuteAsync(
            dbContext,
            ct => CreateReturnAsync(command, status, ct),
            cancellationToken).ConfigureAwait(false);
    }

    private async ValueTask<Guid> CreateReturnAsync(CreateReturnCommand command, ReturnStatus status, CancellationToken cancellationToken)
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
        saleReturn.ApplyVatBreakdown(VatBreakdown.Compute(
            sale.VatRatePercent,
            saleReturn.Items.Select(i => (i.TotalAmount, isTaxable.GetValueOrDefault(i.SaleItemId, true)))));

        dbContext.SaleReturns.Add(saleReturn);
        await dbContext.SaveChangesAsync(cancellationToken).ConfigureAwait(false);

        if (status == ReturnStatus.Completed)
        {
            await SaleReversals.CompleteReturnAsync(dbContext, outbox, currentUser.GetTenant(), sale, saleReturn, cancellationToken)
                .ConfigureAwait(false);
        }

        return saleReturn.Id;
    }
}

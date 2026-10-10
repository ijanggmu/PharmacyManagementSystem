using System.Diagnostics;
using System.Net;
using FSH.Framework.Core.Context;
using FSH.Framework.Core.Exceptions;
using FSH.Framework.Eventing.Abstractions;
using FSH.Modules.Multitenancy.Contracts;
using FSH.Modules.Sales.Contracts.Events;
using FSH.Modules.Sales.Contracts.v1.Returns;
using FSH.Modules.Sales.Data;
using FSH.Modules.Sales.Domain;
using Mediator;
using Microsoft.EntityFrameworkCore;

namespace FSH.Modules.Sales.Features.v1.Returns.CreateReturn;

/// <summary>
/// Ports <c>create_medicine_return</c> (scripts/68-returns-refunds-integrity.sql): the sale must
/// exist, each line must reference a real item on that sale, and the cross-return "cannot return more
/// than was sold" cap sums quantity already returned against that sale line across every non-rejected
/// return. The line amount is always quantity x the SALE's actual unit price — never a client-supplied
/// figure. If created directly with status "completed", stock is restored and the reversing voucher
/// posted the same as a later status-update transition into "completed" would do — both paths funnel
/// through <see cref="SaleReturn.MarkStockRestoredIfNeeded"/> and <c>ReturnCompletedIntegrationEvent</c>.
///
/// Concurrency: the whole write runs in one transaction that first takes <c>SELECT ... FOR UPDATE</c>
/// on the parent sale row. Concurrent returns or refunds against the same sale serialize on that lock,
/// and the "already returned" sums run after it, so the second writer sees the first one's committed
/// quantities and cannot double-return.
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

        // A return is processed at a physical branch exactly like the originating sale — treated as
        // REQUIRED, same extension-beyond-the-scope-table reasoning as SaleReturn.BranchId's doc
        // comment. Resolved before the transaction opens (cached on the scope afterwards).
        var branchId = await currentBranch.RequireBranchIdAsync(cancellationToken).ConfigureAwait(false);

        return await SalesTransaction.ExecuteAsync(
            dbContext,
            ct => CreateReturnAsync(command, status, branchId, ct),
            cancellationToken).ConfigureAwait(false);
    }

    private async ValueTask<Guid> CreateReturnAsync(
        CreateReturnCommand command, ReturnStatus status, Guid branchId, CancellationToken cancellationToken)
    {
        // Lock the parent sale BEFORE any "already returned" sum. Other returns/refunds on this sale block
        // here until this transaction ends, then their sums include the rows committed by this one.
        await SalesTransaction.LockSaleRowAsync(dbContext, command.SaleId, cancellationToken).ConfigureAwait(false);

        var sale = await dbContext.Sales
            .Include(s => s.Items)
            .FirstOrDefaultAsync(s => s.Id == command.SaleId, cancellationToken)
            .ConfigureAwait(false)
            ?? throw new NotFoundException($"Sale {command.SaleId} not found.");

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

            // Sum quantity already returned against this sale line across all non-rejected returns —
            // the cross-return cap from scripts/68. Runs after the sale-row lock.
            decimal alreadyReturned = await (
                from ri in dbContext.SaleReturnItems
                join sr in dbContext.SaleReturns on ri.SaleReturnId equals sr.Id
                where ri.SaleItemId == input.SaleItemId && sr.Status != ReturnStatus.Rejected
                select ri.QuantityReturned)
                .SumAsync(cancellationToken)
                .ConfigureAwait(false);

            if (alreadyReturned + input.QuantityReturned > saleItem.Quantity)
            {
                throw new CustomException(
                    $"Cannot return {input.QuantityReturned} units of sale item {input.SaleItemId} — " +
                    $"{alreadyReturned} of {saleItem.Quantity} already returned/sold.",
                    (IEnumerable<string>?)null, HttpStatusCode.Conflict);
            }

            saleReturn.AddItem(
                saleItem.Id, saleItem.MedicineId, input.QuantityReturned, saleItem.UnitPrice, saleItem.UnitCostPrice,
                input.Reason, packagingCondition);
        }

        dbContext.SaleReturns.Add(saleReturn);
        await dbContext.SaveChangesAsync(cancellationToken).ConfigureAwait(false);

        if (status == ReturnStatus.Completed && saleReturn.MarkStockRestoredIfNeeded())
        {
            await dbContext.SaveChangesAsync(cancellationToken).ConfigureAwait(false);
            await PublishReturnCompletedAsync(saleReturn, cancellationToken).ConfigureAwait(false);
        }

        return saleReturn.Id;
    }

    private async Task PublishReturnCompletedAsync(SaleReturn saleReturn, CancellationToken cancellationToken)
    {
        var lines = saleReturn.Items
            .Select(i => new ReturnCompletedLine(i.MedicineId, i.QuantityReturned, i.UnitCostPrice))
            .ToList();

        string correlationId = Activity.Current?.Id ?? Guid.NewGuid().ToString();
        await outbox.AddAsync(new ReturnCompletedIntegrationEvent(
            Id: Guid.NewGuid(),
            OccurredOnUtc: DateTime.UtcNow,
            TenantId: currentUser.GetTenant(),
            CorrelationId: correlationId,
            Source: "Sales",
            ReturnId: saleReturn.Id,
            SaleId: saleReturn.SaleId,
            BranchId: saleReturn.BranchId,
            TotalReturnAmount: saleReturn.TotalReturnAmount,
            Lines: lines),
            cancellationToken).ConfigureAwait(false);
    }
}

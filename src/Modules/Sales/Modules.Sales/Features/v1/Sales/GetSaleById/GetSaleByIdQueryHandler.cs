using FSH.Framework.Core.Exceptions;
using FSH.Modules.Multitenancy.Contracts;
using FSH.Modules.Sales.Contracts.Dtos;
using FSH.Modules.Sales.Contracts.v1.Sales;
using FSH.Modules.Sales.Data;
using FSH.Modules.Sales.Domain;
using FSH.Modules.Sales.Features.v1.Shared;
using Mediator;
using Microsoft.EntityFrameworkCore;

namespace FSH.Modules.Sales.Features.v1.Sales.GetSaleById;

public sealed class GetSaleByIdQueryHandler(SalesDbContext dbContext, IMediator mediator, ICurrentBranch currentBranch)
    : IQueryHandler<GetSaleByIdQuery, SaleDto>
{
    public async ValueTask<SaleDto> Handle(GetSaleByIdQuery query, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(query);

        var s = await dbContext.Sales
            .AsNoTracking()
            .Include(s => s.Items)
            .Include(s => s.Payments)
            .FirstOrDefaultAsync(s => s.Id == query.SaleId, cancellationToken)
            .ConfigureAwait(false)
            ?? throw new NotFoundException($"Sale {query.SaleId} not found.");
        await currentBranch.EnsureCanSeeBranchAsync(s.BranchId, $"Sale {query.SaleId} not found.", cancellationToken).ConfigureAwait(false);

        int printCount = await dbContext.SalePrints
            .CountAsync(p => p.SaleId == s.Id, cancellationToken)
            .ConfigureAwait(false);

        var medicines = await CrossModuleLookups
            .MedicinesAsync(mediator, s.Items.Select(i => i.MedicineId), cancellationToken)
            .ConfigureAwait(false);
        var customers = await CrossModuleLookups
            .CustomersAsync(mediator, [s.CustomerId], cancellationToken)
            .ConfigureAwait(false);

        var reversed = await LoadReversedQuantitiesAsync(s.Id, cancellationToken).ConfigureAwait(false);

        return SaleMapper.ToDto(s, medicines, customers, printCount, reversed);
    }

    /// <summary>Units per sale line already on non-rejected returns and refunds (soft-deleted ones are hidden
    /// by the query filter), the same consumption the return/refund caps check against.</summary>
    private async Task<Dictionary<Guid, (decimal Returned, decimal Refunded)>> LoadReversedQuantitiesAsync(
        Guid saleId, CancellationToken cancellationToken)
    {
        var returned = await (
            from ri in dbContext.SaleReturnItems
            join sr in dbContext.SaleReturns on ri.SaleReturnId equals sr.Id
            where sr.SaleId == saleId && sr.Status != ReturnStatus.Rejected
            group ri by ri.SaleItemId into g
            select new { SaleItemId = g.Key, Quantity = g.Sum(x => x.QuantityReturned) })
            .ToListAsync(cancellationToken)
            .ConfigureAwait(false);

        var refunded = await (
            from ri in dbContext.SaleRefundItems
            join sr in dbContext.SaleRefunds on ri.SaleRefundId equals sr.Id
            where sr.OriginalSaleId == saleId && sr.Status != RefundStatus.Rejected
            group ri by ri.SaleItemId into g
            select new { SaleItemId = g.Key, Quantity = g.Sum(x => x.QuantityRefunded) })
            .ToListAsync(cancellationToken)
            .ConfigureAwait(false);

        var result = new Dictionary<Guid, (decimal Returned, decimal Refunded)>();
        foreach (var r in returned)
        {
            result[r.SaleItemId] = (r.Quantity, 0m);
        }

        foreach (var r in refunded)
        {
            var current = result.GetValueOrDefault(r.SaleItemId);
            result[r.SaleItemId] = (current.Returned, r.Quantity);
        }

        return result;
    }
}

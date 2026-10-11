using FSH.Framework.Core.Exceptions;
using FSH.Modules.Multitenancy.Contracts;
using FSH.Modules.Sales.Contracts.Dtos;
using FSH.Modules.Sales.Contracts.v1.Sales;
using FSH.Modules.Sales.Data;
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

        return SaleMapper.ToDto(s, medicines, customers, printCount);
    }
}

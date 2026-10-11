using FSH.Framework.Core.Exceptions;
using FSH.Modules.Multitenancy.Contracts;
using FSH.Modules.Sales.Contracts.Dtos;
using FSH.Modules.Sales.Contracts.v1.Returns;
using FSH.Modules.Sales.Data;
using FSH.Modules.Sales.Features.v1.Shared;
using Mediator;
using Microsoft.EntityFrameworkCore;

namespace FSH.Modules.Sales.Features.v1.Returns.GetReturnById;

public sealed class GetReturnByIdQueryHandler(SalesDbContext dbContext, IMediator mediator, ICurrentBranch currentBranch)
    : IQueryHandler<GetReturnByIdQuery, SaleReturnDto>
{
    public async ValueTask<SaleReturnDto> Handle(GetReturnByIdQuery query, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(query);

        var r = await dbContext.SaleReturns
            .AsNoTracking()
            .Include(r => r.Items)
            .FirstOrDefaultAsync(r => r.Id == query.ReturnId, cancellationToken)
            .ConfigureAwait(false)
            ?? throw new NotFoundException($"Return {query.ReturnId} not found.");
        await currentBranch.EnsureCanSeeBranchAsync(r.BranchId, $"Return {query.ReturnId} not found.", cancellationToken).ConfigureAwait(false);

        string? invoiceNumber = await dbContext.Sales
            .AsNoTracking()
            .Where(s => s.Id == r.SaleId)
            .Select(s => s.InvoiceNumber)
            .FirstOrDefaultAsync(cancellationToken)
            .ConfigureAwait(false);
        var medicines = await CrossModuleLookups
            .MedicinesAsync(mediator, r.Items.Select(i => i.MedicineId), cancellationToken)
            .ConfigureAwait(false);
        var customers = await CrossModuleLookups
            .CustomersAsync(mediator, [r.CustomerId], cancellationToken)
            .ConfigureAwait(false);

        return ReturnMapper.ToDto(r, medicines, customers, new Dictionary<Guid, string?> { [r.SaleId] = invoiceNumber });
    }
}

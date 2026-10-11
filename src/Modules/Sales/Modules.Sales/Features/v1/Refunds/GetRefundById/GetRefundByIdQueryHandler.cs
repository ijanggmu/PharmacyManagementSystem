using FSH.Framework.Core.Exceptions;
using FSH.Modules.Multitenancy.Contracts;
using FSH.Modules.Sales.Contracts.Dtos;
using FSH.Modules.Sales.Contracts.v1.Refunds;
using FSH.Modules.Sales.Data;
using FSH.Modules.Sales.Features.v1.Shared;
using Mediator;
using Microsoft.EntityFrameworkCore;

namespace FSH.Modules.Sales.Features.v1.Refunds.GetRefundById;

public sealed class GetRefundByIdQueryHandler(SalesDbContext dbContext, IMediator mediator, ICurrentBranch currentBranch)
    : IQueryHandler<GetRefundByIdQuery, SaleRefundDto>
{
    public async ValueTask<SaleRefundDto> Handle(GetRefundByIdQuery query, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(query);

        var r = await dbContext.SaleRefunds
            .AsNoTracking()
            .Include(r => r.Items)
            .FirstOrDefaultAsync(r => r.Id == query.RefundId, cancellationToken)
            .ConfigureAwait(false)
            ?? throw new NotFoundException($"Refund {query.RefundId} not found.");
        await currentBranch.EnsureCanSeeBranchAsync(r.BranchId, $"Refund {query.RefundId} not found.", cancellationToken).ConfigureAwait(false);

        // Credit-note print needs the original invoice number, each line's VAT status and the print count.
        var sale = await dbContext.Sales
            .AsNoTracking()
            .Where(s => s.Id == r.OriginalSaleId)
            .Select(s => new { s.InvoiceNumber, Items = s.Items.Select(i => new { i.Id, i.IsTaxable }).ToList() })
            .FirstOrDefaultAsync(cancellationToken)
            .ConfigureAwait(false);

        int printCount = await dbContext.RefundPrints
            .CountAsync(p => p.RefundId == r.Id, cancellationToken)
            .ConfigureAwait(false);

        var medicines = await CrossModuleLookups
            .MedicinesAsync(mediator, r.Items.Select(i => i.MedicineId), cancellationToken)
            .ConfigureAwait(false);
        var customers = await CrossModuleLookups
            .CustomersAsync(mediator, [r.CustomerId], cancellationToken)
            .ConfigureAwait(false);

        return RefundMapper.ToDto(
            r,
            sale?.InvoiceNumber,
            sale?.Items.ToDictionary(i => i.Id, i => i.IsTaxable),
            printCount,
            medicines,
            customers);
    }
}

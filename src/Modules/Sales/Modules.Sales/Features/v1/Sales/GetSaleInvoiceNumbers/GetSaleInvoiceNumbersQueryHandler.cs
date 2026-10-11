using FSH.Modules.Sales.Contracts.v1.Sales;
using FSH.Modules.Sales.Data;
using Mediator;
using Microsoft.EntityFrameworkCore;

namespace FSH.Modules.Sales.Features.v1.Sales.GetSaleInvoiceNumbers;

public sealed class GetSaleInvoiceNumbersQueryHandler(SalesDbContext dbContext)
    : IQueryHandler<GetSaleInvoiceNumbersQuery, IReadOnlyList<SaleInvoiceNumberDto>>
{
    public async ValueTask<IReadOnlyList<SaleInvoiceNumberDto>> Handle(
        GetSaleInvoiceNumbersQuery query, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(query);

        if (query.SaleIds.Count == 0)
        {
            return [];
        }

        var ids = query.SaleIds.ToList();
        return await dbContext.Sales
            .AsNoTracking()
            .Where(s => ids.Contains(s.Id))
            .Select(s => new SaleInvoiceNumberDto(s.Id, s.InvoiceNumber))
            .ToListAsync(cancellationToken)
            .ConfigureAwait(false);
    }
}

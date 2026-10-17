using FSH.Modules.Sales.Contracts.v1.Returns;
using FSH.Modules.Sales.Data;
using Mediator;
using Microsoft.EntityFrameworkCore;

namespace FSH.Modules.Sales.Features.v1.Returns.GetSaleReturnNumbers;

public sealed class GetSaleReturnNumbersQueryHandler(SalesDbContext dbContext)
    : IQueryHandler<GetSaleReturnNumbersQuery, IReadOnlyList<SaleReturnNumberDto>>
{
    public async ValueTask<IReadOnlyList<SaleReturnNumberDto>> Handle(
        GetSaleReturnNumbersQuery query, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(query);

        if (query.ReturnIds.Count == 0)
        {
            return [];
        }

        var ids = query.ReturnIds.ToList();
        return await dbContext.SaleReturns
            .AsNoTracking()
            .Where(r => ids.Contains(r.Id))
            .Select(r => new SaleReturnNumberDto(r.Id, r.CreditNoteNumber))
            .ToListAsync(cancellationToken)
            .ConfigureAwait(false);
    }
}

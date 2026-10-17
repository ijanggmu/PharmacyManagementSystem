using FSH.Modules.Suppliers.Contracts.v1.Returns;
using FSH.Modules.Suppliers.Data;
using Mediator;
using Microsoft.EntityFrameworkCore;

namespace FSH.Modules.Suppliers.Features.v1.Returns.GetSupplierReturnNumbers;

public sealed class GetSupplierReturnNumbersQueryHandler(SuppliersDbContext dbContext)
    : IQueryHandler<GetSupplierReturnNumbersQuery, IReadOnlyList<SupplierReturnNumberDto>>
{
    public async ValueTask<IReadOnlyList<SupplierReturnNumberDto>> Handle(
        GetSupplierReturnNumbersQuery query, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(query);

        if (query.ReturnIds.Count == 0)
        {
            return [];
        }

        var ids = query.ReturnIds.ToList();
        return await dbContext.SupplierReturns
            .AsNoTracking()
            .Where(r => ids.Contains(r.Id))
            .Select(r => new SupplierReturnNumberDto(r.Id, r.DocumentNumber))
            .ToListAsync(cancellationToken)
            .ConfigureAwait(false);
    }
}

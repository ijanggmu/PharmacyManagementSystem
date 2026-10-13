using FSH.Modules.Accounting.Contracts.Dtos;
using FSH.Modules.Accounting.Contracts.v1.Tds;
using FSH.Modules.Accounting.Data;
using FSH.Modules.Accounting.Services;
using Mediator;

namespace FSH.Modules.Accounting.Features.v1.Tds.GetTdsCategories;

public sealed class GetTdsCategoriesQueryHandler(AccountingDbContext dbContext)
    : IQueryHandler<GetTdsCategoriesQuery, IReadOnlyList<TdsCategoryDto>>
{
    public async ValueTask<IReadOnlyList<TdsCategoryDto>> Handle(GetTdsCategoriesQuery query, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(query);
        return await TdsCategoryCatalog.ListAsync(dbContext, cancellationToken).ConfigureAwait(false);
    }
}

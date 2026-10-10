using FSH.Framework.Persistence;
using FSH.Framework.Shared.Persistence;
using FSH.Modules.Reference.Contracts.Dtos;
using FSH.Modules.Reference.Contracts.v1.Categories;
using FSH.Modules.Reference.Data;
using Mediator;
using Microsoft.EntityFrameworkCore;

namespace FSH.Modules.Reference.Features.v1.Categories.ListTrashedMedicineCategories;

public sealed class ListTrashedMedicineCategoriesQueryHandler(ReferenceDbContext dbContext)
    : IQueryHandler<ListTrashedMedicineCategoriesQuery, PagedResponse<MedicineCategoryDto>>
{
    public async ValueTask<PagedResponse<MedicineCategoryDto>> Handle(
        ListTrashedMedicineCategoriesQuery query, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(query);

        int page = query.PageNumber < 1 ? 1 : query.PageNumber;
        int size = query.PageSize is < 1 or > 200 ? 20 : query.PageSize;

        var q = dbContext.MedicineCategories
            .AsNoTracking()
            .IgnoreQueryFilters([QueryFilters.SoftDelete])
            .Where(c => c.IsDeleted)
            .OrderByDescending(c => c.DeletedOnUtc);

        long total = await q.LongCountAsync(cancellationToken).ConfigureAwait(false);
        var items = await q
            .Skip((page - 1) * size)
            .Take(size)
            .Select(c => new MedicineCategoryDto(
                c.Id, c.Name, c.Slug, c.Description, c.ParentCategoryId,
                c.CreatedAtUtc, c.UpdatedAtUtc, c.DeletedOnUtc, c.DeletedBy))
            .ToListAsync(cancellationToken)
            .ConfigureAwait(false);

        return new PagedResponse<MedicineCategoryDto>
        {
            Items = items,
            PageNumber = page,
            PageSize = size,
            TotalCount = total,
            TotalPages = (int)Math.Ceiling(total / (double)size),
        };
    }
}

using FSH.Framework.Shared.Persistence;
using FSH.Modules.Reference.Contracts.Dtos;
using FSH.Modules.Reference.Contracts.v1.Categories;
using FSH.Modules.Reference.Data;
using FSH.Modules.Reference.Domain;
using Mediator;
using Microsoft.EntityFrameworkCore;

namespace FSH.Modules.Reference.Features.v1.Categories.SearchMedicineCategories;

public sealed class SearchMedicineCategoriesQueryHandler(ReferenceDbContext dbContext)
    : IQueryHandler<SearchMedicineCategoriesQuery, PagedResponse<MedicineCategoryDto>>
{
    public async ValueTask<PagedResponse<MedicineCategoryDto>> Handle(SearchMedicineCategoriesQuery query, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(query);

        int page = query.PageNumber < 1 ? 1 : query.PageNumber;
        int size = query.PageSize is < 1 or > 200 ? 50 : query.PageSize;

        var q = dbContext.MedicineCategories.AsNoTracking().AsQueryable();

        if (query.ParentCategoryId is { } parentId)
        {
            q = q.Where(c => c.ParentCategoryId == parentId);
        }

        if (!string.IsNullOrWhiteSpace(query.Search))
        {
            string term = query.Search.Trim();
            q = q.Where(c =>
                EF.Functions.ILike(c.Name, $"%{term}%") ||
                EF.Functions.ILike(c.Slug, $"%{term}%"));
        }

        q = ApplySort(q, query.SortBy, query.SortDir);

        long total = await q.LongCountAsync(cancellationToken).ConfigureAwait(false);
        var categories = await q
            .Skip((page - 1) * size)
            .Take(size)
            .ToListAsync(cancellationToken)
            .ConfigureAwait(false);

        return new PagedResponse<MedicineCategoryDto>
        {
            Items = categories
                .Select(c => new MedicineCategoryDto(c.Id, c.Name, c.Slug, c.Description, c.ParentCategoryId, c.CreatedAtUtc, c.UpdatedAtUtc, c.DeletedOnUtc, c.DeletedBy))
                .ToList(),
            PageNumber = page,
            PageSize = size,
            TotalCount = total,
            TotalPages = (int)Math.Ceiling(total / (double)size)
        };
    }

    private static IQueryable<MedicineCategory> ApplySort(IQueryable<MedicineCategory> q, string? sortBy, string? sortDir)
    {
        bool desc = string.Equals(sortDir, "desc", StringComparison.OrdinalIgnoreCase);
        return (sortBy?.ToUpperInvariant()) switch
        {
            "SLUG" => desc ? q.OrderByDescending(c => c.Slug) : q.OrderBy(c => c.Slug),
            "CREATEDATUTC" or "CREATED" => desc
                ? q.OrderByDescending(c => c.CreatedAtUtc)
                : q.OrderBy(c => c.CreatedAtUtc),
            _ => desc ? q.OrderByDescending(c => c.Name) : q.OrderBy(c => c.Name),
        };
    }
}

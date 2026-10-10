using FSH.Modules.Reference.Contracts.Dtos;
using FSH.Modules.Reference.Contracts.v1.Categories;
using FSH.Modules.Reference.Data;
using Mediator;
using Microsoft.EntityFrameworkCore;

namespace FSH.Modules.Reference.Features.v1.Categories.GetMedicineCategoryTree;

public sealed class GetMedicineCategoryTreeQueryHandler(ReferenceDbContext dbContext)
    : IQueryHandler<GetMedicineCategoryTreeQuery, IReadOnlyList<MedicineCategoryTreeNodeDto>>
{
    public async ValueTask<IReadOnlyList<MedicineCategoryTreeNodeDto>> Handle(GetMedicineCategoryTreeQuery query, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(query);

        var all = await dbContext.MedicineCategories
            .AsNoTracking()
            .OrderBy(c => c.Name)
            .ToListAsync(cancellationToken)
            .ConfigureAwait(false);

        var byParent = all.ToLookup(c => c.ParentCategoryId);

        IReadOnlyList<MedicineCategoryTreeNodeDto> Build(Guid? parentId)
        {
            return byParent[parentId]
                .Select(c => new MedicineCategoryTreeNodeDto(c.Id, c.Name, c.Slug, c.Description, Build(c.Id)))
                .ToList();
        }

        return Build(null);
    }
}

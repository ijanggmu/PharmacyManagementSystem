using FSH.Framework.Core.Exceptions;
using FSH.Modules.Reference.Contracts.Dtos;
using FSH.Modules.Reference.Contracts.v1.Categories;
using FSH.Modules.Reference.Data;
using Mediator;
using Microsoft.EntityFrameworkCore;

namespace FSH.Modules.Reference.Features.v1.Categories.GetMedicineCategoryById;

public sealed class GetMedicineCategoryByIdQueryHandler(ReferenceDbContext dbContext)
    : IQueryHandler<GetMedicineCategoryByIdQuery, MedicineCategoryDto>
{
    public async ValueTask<MedicineCategoryDto> Handle(GetMedicineCategoryByIdQuery query, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(query);

        var c = await dbContext.MedicineCategories
            .AsNoTracking()
            .FirstOrDefaultAsync(c => c.Id == query.CategoryId, cancellationToken)
            .ConfigureAwait(false)
            ?? throw new NotFoundException($"Category {query.CategoryId} not found.");

        return new MedicineCategoryDto(c.Id, c.Name, c.Slug, c.Description, c.ParentCategoryId, c.CreatedAtUtc, c.UpdatedAtUtc, c.DeletedOnUtc, c.DeletedBy);
    }
}

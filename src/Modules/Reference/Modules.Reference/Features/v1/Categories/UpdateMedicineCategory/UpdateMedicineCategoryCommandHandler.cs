using System.Net;
using FSH.Framework.Core.Exceptions;
using FSH.Modules.Reference.Contracts.v1.Categories;
using FSH.Modules.Reference.Data;
using Mediator;
using Microsoft.EntityFrameworkCore;

namespace FSH.Modules.Reference.Features.v1.Categories.UpdateMedicineCategory;

public sealed class UpdateMedicineCategoryCommandHandler(ReferenceDbContext dbContext)
    : ICommandHandler<UpdateMedicineCategoryCommand, Guid>
{
    public async ValueTask<Guid> Handle(UpdateMedicineCategoryCommand command, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(command);

        var category = await dbContext.MedicineCategories
            .FirstOrDefaultAsync(c => c.Id == command.CategoryId, cancellationToken)
            .ConfigureAwait(false)
            ?? throw new NotFoundException($"Category {command.CategoryId} not found.");

        if (command.ParentCategoryId is { } parentId)
        {
            if (parentId == category.Id)
            {
                throw new CustomException(
                    "A category cannot be its own parent.",
                    (IEnumerable<string>?)null,
                    HttpStatusCode.BadRequest);
            }

            var visited = new HashSet<Guid> { category.Id };
            Guid? cursor = parentId;
            while (cursor is { } cur)
            {
                if (!visited.Add(cur))
                {
                    throw new CustomException(
                        "Setting this parent would create a cycle.",
                        (IEnumerable<string>?)null,
                        HttpStatusCode.BadRequest);
                }
                cursor = await dbContext.MedicineCategories
                    .Where(c => c.Id == cur)
                    .Select(c => c.ParentCategoryId)
                    .FirstOrDefaultAsync(cancellationToken)
                    .ConfigureAwait(false);
            }
        }

        category.Update(command.Name, command.Description, command.ParentCategoryId);

        bool slugTaken = await dbContext.MedicineCategories
            .AnyAsync(c => c.Slug == category.Slug && c.Id != category.Id, cancellationToken)
            .ConfigureAwait(false);
        if (slugTaken)
        {
            throw new CustomException(
                $"Another category with name '{command.Name}' already exists.",
                (IEnumerable<string>?)null,
                HttpStatusCode.Conflict);
        }

        await dbContext.SaveChangesAsync(cancellationToken).ConfigureAwait(false);
        return category.Id;
    }
}

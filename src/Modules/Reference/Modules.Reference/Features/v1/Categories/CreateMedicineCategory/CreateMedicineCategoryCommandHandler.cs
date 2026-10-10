using System.Net;
using FSH.Framework.Core.Exceptions;
using FSH.Modules.Reference.Contracts.v1.Categories;
using FSH.Modules.Reference.Data;
using FSH.Modules.Reference.Domain;
using Mediator;
using Microsoft.EntityFrameworkCore;

namespace FSH.Modules.Reference.Features.v1.Categories.CreateMedicineCategory;

public sealed class CreateMedicineCategoryCommandHandler(ReferenceDbContext dbContext)
    : ICommandHandler<CreateMedicineCategoryCommand, Guid>
{
    public async ValueTask<Guid> Handle(CreateMedicineCategoryCommand command, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(command);

        if (command.ParentCategoryId is { } parentId)
        {
            bool parentExists = await dbContext.MedicineCategories
                .AnyAsync(c => c.Id == parentId, cancellationToken)
                .ConfigureAwait(false);
            if (!parentExists)
            {
                throw new NotFoundException($"Parent category {parentId} not found.");
            }
        }

        var category = MedicineCategory.Create(command.Name, command.Description, command.ParentCategoryId);

        bool slugTaken = await dbContext.MedicineCategories
            .AnyAsync(c => c.Slug == category.Slug, cancellationToken)
            .ConfigureAwait(false);
        if (slugTaken)
        {
            throw new CustomException(
                $"A category with name '{command.Name}' already exists.",
                (IEnumerable<string>?)null,
                HttpStatusCode.Conflict);
        }

        dbContext.MedicineCategories.Add(category);
        await dbContext.SaveChangesAsync(cancellationToken).ConfigureAwait(false);
        return category.Id;
    }
}

using System.Net;
using FSH.Framework.Core.Exceptions;
using FSH.Modules.Reference.Contracts.v1.Categories;
using FSH.Modules.Reference.Data;
using Mediator;
using Microsoft.EntityFrameworkCore;

namespace FSH.Modules.Reference.Features.v1.Categories.DeleteMedicineCategory;

public sealed class DeleteMedicineCategoryCommandHandler(ReferenceDbContext dbContext)
    : ICommandHandler<DeleteMedicineCategoryCommand, Unit>
{
    public async ValueTask<Unit> Handle(DeleteMedicineCategoryCommand command, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(command);

        var category = await dbContext.MedicineCategories
            .FirstOrDefaultAsync(c => c.Id == command.CategoryId, cancellationToken)
            .ConfigureAwait(false)
            ?? throw new NotFoundException($"Category {command.CategoryId} not found.");

        bool hasChildren = await dbContext.MedicineCategories
            .AnyAsync(c => c.ParentCategoryId == category.Id, cancellationToken)
            .ConfigureAwait(false);
        if (hasChildren)
        {
            throw new CustomException(
                "Cannot delete a category that has child categories. Move or remove the children first.",
                (IEnumerable<string>?)null,
                HttpStatusCode.Conflict);
        }

        dbContext.MedicineCategories.Remove(category);
        await dbContext.SaveChangesAsync(cancellationToken).ConfigureAwait(false);
        return Unit.Value;
    }
}

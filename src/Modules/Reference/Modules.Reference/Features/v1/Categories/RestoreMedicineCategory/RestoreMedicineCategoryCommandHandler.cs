using FSH.Framework.Core.Exceptions;
using FSH.Framework.Persistence;
using FSH.Modules.Reference.Contracts.v1.Categories;
using FSH.Modules.Reference.Data;
using Mediator;
using Microsoft.EntityFrameworkCore;

namespace FSH.Modules.Reference.Features.v1.Categories.RestoreMedicineCategory;

public sealed class RestoreMedicineCategoryCommandHandler(ReferenceDbContext dbContext)
    : ICommandHandler<RestoreMedicineCategoryCommand, Guid>
{
    public async ValueTask<Guid> Handle(RestoreMedicineCategoryCommand command, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(command);

        var category = await dbContext.MedicineCategories
            .IgnoreQueryFilters([QueryFilters.SoftDelete])
            .FirstOrDefaultAsync(c => c.Id == command.CategoryId, cancellationToken)
            .ConfigureAwait(false)
            ?? throw new NotFoundException($"Category {command.CategoryId} not found.");

        category.Restore();
        await dbContext.SaveChangesAsync(cancellationToken).ConfigureAwait(false);
        return category.Id;
    }
}

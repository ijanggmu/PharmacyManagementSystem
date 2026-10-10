using FluentValidation;
using FSH.Modules.Reference.Contracts.v1.Categories;

namespace FSH.Modules.Reference.Features.v1.Categories.DeleteMedicineCategory;

public sealed class DeleteMedicineCategoryCommandValidator : AbstractValidator<DeleteMedicineCategoryCommand>
{
    public DeleteMedicineCategoryCommandValidator()
    {
        RuleFor(x => x.CategoryId).NotEmpty();
    }
}

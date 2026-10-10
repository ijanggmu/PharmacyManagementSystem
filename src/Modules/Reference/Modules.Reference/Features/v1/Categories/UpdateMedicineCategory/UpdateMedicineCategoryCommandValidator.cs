using FluentValidation;
using FSH.Modules.Reference.Contracts.v1.Categories;

namespace FSH.Modules.Reference.Features.v1.Categories.UpdateMedicineCategory;

public sealed class UpdateMedicineCategoryCommandValidator : AbstractValidator<UpdateMedicineCategoryCommand>
{
    public UpdateMedicineCategoryCommandValidator()
    {
        RuleFor(x => x.CategoryId).NotEmpty();
        RuleFor(x => x.Name).NotEmpty().MaximumLength(128);
        RuleFor(x => x.Description).MaximumLength(1024);
    }
}

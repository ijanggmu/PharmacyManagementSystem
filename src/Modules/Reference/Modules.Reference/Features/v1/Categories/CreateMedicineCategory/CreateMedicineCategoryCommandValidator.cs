using FluentValidation;
using FSH.Modules.Reference.Contracts.v1.Categories;

namespace FSH.Modules.Reference.Features.v1.Categories.CreateMedicineCategory;

public sealed class CreateMedicineCategoryCommandValidator : AbstractValidator<CreateMedicineCategoryCommand>
{
    public CreateMedicineCategoryCommandValidator()
    {
        RuleFor(x => x.Name).NotEmpty().MaximumLength(128);
        RuleFor(x => x.Description).MaximumLength(1024);
    }
}

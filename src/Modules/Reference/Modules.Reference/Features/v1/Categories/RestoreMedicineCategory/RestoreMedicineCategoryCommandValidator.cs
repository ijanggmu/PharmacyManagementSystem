using FluentValidation;
using FSH.Modules.Reference.Contracts.v1.Categories;

namespace FSH.Modules.Reference.Features.v1.Categories.RestoreMedicineCategory;

public sealed class RestoreMedicineCategoryCommandValidator : AbstractValidator<RestoreMedicineCategoryCommand>
{
    public RestoreMedicineCategoryCommandValidator()
    {
        RuleFor(x => x.CategoryId).NotEmpty();
    }
}

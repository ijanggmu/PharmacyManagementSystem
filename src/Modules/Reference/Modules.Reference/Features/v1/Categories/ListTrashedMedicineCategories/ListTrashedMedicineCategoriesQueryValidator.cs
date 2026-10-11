using FluentValidation;
using FSH.Modules.Reference.Contracts.v1.Categories;

namespace FSH.Modules.Reference.Features.v1.Categories.ListTrashedMedicineCategories;

public sealed class ListTrashedMedicineCategoriesQueryValidator : AbstractValidator<ListTrashedMedicineCategoriesQuery>
{
    public ListTrashedMedicineCategoriesQueryValidator()
    {
        RuleFor(x => x.PageNumber).GreaterThanOrEqualTo(1);
        RuleFor(x => x.PageSize).InclusiveBetween(1, 200);
    }
}

using FluentValidation;
using FSH.Modules.Reference.Contracts.v1.Categories;

namespace FSH.Modules.Reference.Features.v1.Categories.SearchMedicineCategories;

public sealed class SearchMedicineCategoriesQueryValidator : AbstractValidator<SearchMedicineCategoriesQuery>
{
    public SearchMedicineCategoriesQueryValidator()
    {
        RuleFor(x => x.PageNumber).GreaterThanOrEqualTo(1);
        RuleFor(x => x.PageSize).InclusiveBetween(1, 200);
    }
}

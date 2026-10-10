using FluentValidation;
using FSH.Modules.Suppliers.Contracts.v1.Suppliers;

namespace FSH.Modules.Suppliers.Features.v1.Suppliers.SearchSuppliers;

public sealed class SearchSuppliersQueryValidator : AbstractValidator<SearchSuppliersQuery>
{
    public SearchSuppliersQueryValidator()
    {
        RuleFor(x => x.PageNumber).GreaterThanOrEqualTo(1);
        RuleFor(x => x.PageSize).InclusiveBetween(1, 200);
    }
}

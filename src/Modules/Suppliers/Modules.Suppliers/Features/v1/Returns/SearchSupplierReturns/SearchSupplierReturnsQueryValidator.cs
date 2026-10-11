using FluentValidation;
using FSH.Modules.Suppliers.Contracts.v1.Returns;

namespace FSH.Modules.Suppliers.Features.v1.Returns.SearchSupplierReturns;

public sealed class SearchSupplierReturnsQueryValidator : AbstractValidator<SearchSupplierReturnsQuery>
{
    public SearchSupplierReturnsQueryValidator()
    {
        RuleFor(x => x.PageNumber).GreaterThanOrEqualTo(1);
        RuleFor(x => x.PageSize).InclusiveBetween(1, 200);
    }
}

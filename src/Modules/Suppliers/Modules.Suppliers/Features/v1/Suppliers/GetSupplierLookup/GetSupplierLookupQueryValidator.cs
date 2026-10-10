using FluentValidation;
using FSH.Modules.Suppliers.Contracts.v1.Suppliers;

namespace FSH.Modules.Suppliers.Features.v1.Suppliers.GetSupplierLookup;

public sealed class GetSupplierLookupQueryValidator : AbstractValidator<GetSupplierLookupQuery>
{
    public GetSupplierLookupQueryValidator()
    {
        RuleFor(x => x.Limit).InclusiveBetween(1, GetSupplierLookupQuery.MaxLimit);
        RuleFor(x => x.Search).MaximumLength(200);
        RuleFor(x => x.Ids!.Count)
            .LessThanOrEqualTo(GetSupplierLookupQuery.MaxLimit)
            .When(x => x.Ids is not null)
            .WithMessage($"At most {GetSupplierLookupQuery.MaxLimit} supplier ids can be looked up at once.");
    }
}

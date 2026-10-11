using FluentValidation;
using FSH.Modules.Purchasing.Contracts.v1.PurchaseOrders;

namespace FSH.Modules.Purchasing.Features.v1.PurchaseOrders.SearchPurchaseOrders;

public sealed class SearchPurchaseOrdersQueryValidator : AbstractValidator<SearchPurchaseOrdersQuery>
{
    public SearchPurchaseOrdersQueryValidator()
    {
        RuleFor(x => x.PageNumber).GreaterThanOrEqualTo(1);
        RuleFor(x => x.PageSize).InclusiveBetween(1, 200);
        RuleFor(x => x.Status)
            .Must(PurchaseOrderStatusFilter.IsValid)
            .WithMessage("Status must be one or more of: Draft, Approved, Received, Cancelled (comma-separated).");
        RuleFor(x => x.Search).MaximumLength(200);
        RuleFor(x => x.DateToUtc)
            .GreaterThanOrEqualTo(x => x.DateFromUtc)
            .When(x => x.DateFromUtc is not null && x.DateToUtc is not null)
            .WithMessage("The end date must be on or after the start date.");
    }
}

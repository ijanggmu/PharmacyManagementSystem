using FluentValidation;
using FSH.Modules.Inventory.Contracts.v1.Medicines;

namespace FSH.Modules.Inventory.Features.v1.Medicines.SearchMedicines;

public sealed class SearchMedicinesQueryValidator : AbstractValidator<SearchMedicinesQuery>
{
    public SearchMedicinesQueryValidator()
    {
        RuleFor(x => x.PageNumber).GreaterThanOrEqualTo(1);
        RuleFor(x => x.PageSize).InclusiveBetween(1, 200);
        RuleForEach(x => x.StockStatuses)
            .Must(s => s is "in" or "low" or "out")
            .WithMessage("Stock status must be one of: in, low, out.");
        RuleForEach(x => x.ExpiryStatuses)
            .Must(s => s is "expiring" or "expired")
            .WithMessage("Expiry status must be one of: expiring, expired.");
        When(x => x.SortBy is not null, () =>
        {
            RuleFor(x => x.SortBy!)
                .Must(s => s is "name" or "quantity" or "expiry" or "price" or "updated")
                .WithMessage("Sort by must be one of: name, quantity, expiry, price, updated.");
        });
        When(x => x.SortOrder is not null, () =>
        {
            RuleFor(x => x.SortOrder!)
                .Must(s => s is "asc" or "desc")
                .WithMessage("Sort order must be asc or desc.");
        });
    }
}

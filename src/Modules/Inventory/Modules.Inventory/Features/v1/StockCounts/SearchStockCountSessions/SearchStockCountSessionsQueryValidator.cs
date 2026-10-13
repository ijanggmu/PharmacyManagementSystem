using FluentValidation;
using FSH.Modules.Inventory.Contracts.v1.StockCounts;
using FSH.Modules.Inventory.Domain;

namespace FSH.Modules.Inventory.Features.v1.StockCounts.SearchStockCountSessions;

public sealed class SearchStockCountSessionsQueryValidator : AbstractValidator<SearchStockCountSessionsQuery>
{
    public SearchStockCountSessionsQueryValidator()
    {
        RuleFor(x => x.PageNumber).GreaterThanOrEqualTo(1);
        RuleFor(x => x.PageSize).InclusiveBetween(1, 200);
        RuleFor(x => x.Status)
            .Must(s => Enum.TryParse<StockCountStatus>(s, true, out _))
            .When(x => !string.IsNullOrWhiteSpace(x.Status))
            .WithMessage("status must be one of: Draft, Counting, Review, Posted, Cancelled.");
    }
}

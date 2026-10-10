using FluentValidation;
using FSH.Modules.Sales.Contracts.v1.Refunds;
using FSH.Modules.Sales.Features.v1.Sales.SearchSales;
using FSH.Modules.Sales.Features.v1.Shared;

namespace FSH.Modules.Sales.Features.v1.Refunds.SearchRefunds;

public sealed class SearchRefundsQueryValidator : AbstractValidator<SearchRefundsQuery>
{
    public SearchRefundsQueryValidator()
    {
        RuleFor(x => x.PageNumber).GreaterThanOrEqualTo(1);
        RuleFor(x => x.PageSize).InclusiveBetween(1, 200);
        RuleFor(x => x.Search).MaximumLength(100);

        RuleFor(x => x.MinAmount).GreaterThanOrEqualTo(0).When(x => x.MinAmount is not null);
        RuleFor(x => x.MaxAmount).GreaterThanOrEqualTo(0).When(x => x.MaxAmount is not null);
        RuleFor(x => x.MaxAmount)
            .GreaterThanOrEqualTo(x => x.MinAmount)
            .When(x => x.MinAmount is not null && x.MaxAmount is not null)
            .WithMessage("Maximum amount must be greater than or equal to the minimum amount.");

        RuleFor(x => x.ToDate)
            .GreaterThanOrEqualTo(x => x.FromDate)
            .When(x => x.FromDate is not null && x.ToDate is not null)
            .WithMessage("The end date must be on or after the start date.");

        RuleFor(x => x.SortBy)
            .Must(s => ListSearch.IsNullOrOneOf(s, SearchRefundsQuery.SortFields))
            .WithMessage($"Sort field must be one of: {string.Join(", ", SearchRefundsQuery.SortFields)}.");

        RuleFor(x => x.SortOrder)
            .Must(SearchSalesQueryValidator.BeSortOrder)
            .WithMessage("Sort order must be 'asc' or 'desc'.");
    }
}

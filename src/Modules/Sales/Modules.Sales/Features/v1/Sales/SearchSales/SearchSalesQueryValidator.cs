using FluentValidation;
using FSH.Modules.Sales.Contracts.v1.Sales;
using FSH.Modules.Sales.Domain;
using FSH.Modules.Sales.Features.v1.Shared;

namespace FSH.Modules.Sales.Features.v1.Sales.SearchSales;

public sealed class SearchSalesQueryValidator : AbstractValidator<SearchSalesQuery>
{
    private static readonly HashSet<string> AllowedMethods =
        new([.. SalePaymentMethods.All, SalePaymentMethods.Mixed], StringComparer.OrdinalIgnoreCase);

    public SearchSalesQueryValidator()
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
            .Must(s => ListSearch.IsNullOrOneOf(s, SearchSalesQuery.SortFields))
            .WithMessage($"Sort field must be one of: {string.Join(", ", SearchSalesQuery.SortFields)}.");

        RuleFor(x => x.SortOrder)
            .Must(BeSortOrder)
            .WithMessage("Sort order must be 'asc' or 'desc'.");

        RuleFor(x => x.PaymentStatuses)
            .Must(v => ListSearch.SplitValues(v).All(s => ListSearch.IsNullOrOneOf(s, SearchSalesQuery.PaymentStatusValues)))
            .WithMessage($"Payment status must be any of: {string.Join(", ", SearchSalesQuery.PaymentStatusValues)}.");

        RuleFor(x => x.PaymentMethods)
            .Must(v => ListSearch.SplitValues(v).All(AllowedMethods.Contains))
            .WithMessage("Unknown payment method.");
    }

    internal static bool BeSortOrder(string? order) =>
        order is null
        || string.Equals(order.Trim(), "asc", StringComparison.OrdinalIgnoreCase)
        || string.Equals(order.Trim(), "desc", StringComparison.OrdinalIgnoreCase);
}

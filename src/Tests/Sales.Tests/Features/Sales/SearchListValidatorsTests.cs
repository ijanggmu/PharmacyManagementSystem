using FSH.Modules.Sales.Contracts.v1.Refunds;
using FSH.Modules.Sales.Contracts.v1.Returns;
using FSH.Modules.Sales.Contracts.v1.Sales;
using FSH.Modules.Sales.Features.v1.Refunds.SearchRefunds;
using FSH.Modules.Sales.Features.v1.Returns.SearchReturns;
using FSH.Modules.Sales.Features.v1.Sales.SearchSales;

namespace Sales.Tests.Features.Sales;

public sealed class SearchListValidatorsTests
{
    private readonly SearchSalesQueryValidator _sales = new();
    private readonly SearchReturnsQueryValidator _returns = new();
    private readonly SearchRefundsQueryValidator _refunds = new();

    [Fact]
    public void SearchSales_Should_AcceptEveryFrontendFilter()
    {
        var query = new SearchSalesQuery(
            Search: "INV-1",
            PaymentStatuses: ["paid", "pending", "completed", "failed", "refunded", "cancelled"],
            PaymentMethods: ["cash", "card", "insurance", "fonepay", "esewa", "khalti", "bank", "credit", "mixed", "other"],
            MinAmount: 10m,
            MaxAmount: 20m,
            SortBy: "total_amount",
            SortOrder: "asc",
            FromDate: new DateOnly(2026, 10, 1),
            ToDate: new DateOnly(2026, 10, 1));

        _sales.Validate(query).IsValid.ShouldBeTrue();
    }

    [Theory]
    [InlineData("customer_name", null)]
    [InlineData(null, "sideways")]
    public void SearchSales_Should_RejectUnknownSort(string? sortBy, string? sortOrder)
    {
        _sales.Validate(new SearchSalesQuery(SortBy: sortBy, SortOrder: sortOrder)).IsValid.ShouldBeFalse();
    }

    [Fact]
    public void SearchSales_Should_RejectInvertedRanges_And_UnknownValues()
    {
        _sales.Validate(new SearchSalesQuery(MinAmount: 50m, MaxAmount: 10m)).IsValid.ShouldBeFalse();
        _sales.Validate(new SearchSalesQuery(FromDate: new DateOnly(2026, 10, 2), ToDate: new DateOnly(2026, 10, 1))).IsValid.ShouldBeFalse();
        _sales.Validate(new SearchSalesQuery(PaymentStatuses: ["overdue"])).IsValid.ShouldBeFalse();
        _sales.Validate(new SearchSalesQuery(PaymentMethods: ["bitcoin"])).IsValid.ShouldBeFalse();
    }

    [Fact]
    public void SearchReturnsAndRefunds_Should_AcceptTheirSortFields_And_RejectOthers()
    {
        _returns.Validate(new SearchReturnsQuery(SortBy: "total_return_amount", SortOrder: "desc")).IsValid.ShouldBeTrue();
        _returns.Validate(new SearchReturnsQuery(SortBy: "refund_number")).IsValid.ShouldBeFalse();
        _refunds.Validate(new SearchRefundsQuery(SortBy: "net_refund_amount", SortOrder: "asc")).IsValid.ShouldBeTrue();
        _refunds.Validate(new SearchRefundsQuery(SortBy: "total_return_amount")).IsValid.ShouldBeFalse();
    }
}

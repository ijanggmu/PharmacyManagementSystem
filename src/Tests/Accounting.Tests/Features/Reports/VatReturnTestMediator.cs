using FSH.Modules.Purchasing.Contracts.Dtos;
using FSH.Modules.Purchasing.Contracts.v1.Reports;
using FSH.Modules.Sales.Contracts.Dtos;
using FSH.Modules.Sales.Contracts.v1.Ird;
using Mediator;
using NSubstitute;

namespace Accounting.Tests.Features.Reports;

/// <summary>An <see cref="IMediator"/> answering the VAT return's register summary queries.</summary>
internal static class VatReturnTestMediator
{
    public static IMediator Empty() => With(null, null);

    public static IMediator With(SalesVatSummaryDto? sales, PurchaseVatSummaryDto? purchases)
    {
        var mediator = Substitute.For<IMediator>();
#pragma warning disable CA2012 // NSubstitute stores the ValueTask as a configured return value.
        mediator.Send(Arg.Any<GetSalesVatSummaryQuery>(), Arg.Any<CancellationToken>())
            .Returns(ci => new ValueTask<SalesVatSummaryDto>(sales ?? EmptySales(ci.ArgAt<GetSalesVatSummaryQuery>(0))));
        mediator.Send(Arg.Any<GetPurchaseVatSummaryQuery>(), Arg.Any<CancellationToken>())
            .Returns(ci => new ValueTask<PurchaseVatSummaryDto>(purchases ?? EmptyPurchases(ci.ArgAt<GetPurchaseVatSummaryQuery>(0))));
#pragma warning restore CA2012
        return mediator;
    }

    public static SalesVatSummaryDto Sales(
        decimal taxable = 0m, decimal exempt = 0m, decimal vat = 0m,
        decimal returnsTaxable = 0m, decimal returnsExempt = 0m, decimal returnsVat = 0m) =>
        new(DateTime.MinValue, DateTime.MaxValue, 1, taxable, exempt, vat, 0m, 0m, 1, returnsTaxable, returnsExempt, returnsVat);

    public static PurchaseVatSummaryDto Purchases(
        decimal taxable = 0m, decimal exempt = 0m, decimal vat = 0m,
        decimal debitTaxable = 0m, decimal debitExempt = 0m, decimal debitVat = 0m) =>
        new(DateTime.MinValue, DateTime.MaxValue, 1, taxable, exempt, vat, 0m, 0m, 1, debitTaxable, debitExempt, debitVat);

    private static SalesVatSummaryDto EmptySales(GetSalesVatSummaryQuery q) =>
        new(q.PeriodStartUtc, q.PeriodEndUtc, 0, 0m, 0m, 0m, 0m, 0m, 0, 0m, 0m, 0m);

    private static PurchaseVatSummaryDto EmptyPurchases(GetPurchaseVatSummaryQuery q) =>
        new(q.PeriodStartUtc, q.PeriodEndUtc, 0, 0m, 0m, 0m, 0m, 0m, 0, 0m, 0m, 0m);
}

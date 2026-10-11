using FSH.Modules.Accounting.Contracts.Dtos;
using FSH.Modules.Accounting.Contracts.v1.Reports;
using FSH.Modules.Accounting.Features.v1.Reports.GetReportsOverview;
using FSH.Modules.Inventory.Contracts.Dtos;
using FSH.Modules.Inventory.Contracts.v1.Reports;
using FSH.Modules.Prescriptions.Contracts.Dtos;
using FSH.Modules.Prescriptions.Contracts.v1.Reports;
using FSH.Modules.Sales.Contracts.Dtos;
using FSH.Modules.Sales.Contracts.v1.Sales;
using Mediator;
using NSubstitute;
using Shouldly;
using Xunit;

namespace Accounting.Tests.Features.Reports;

public sealed class GetReportsOverviewQueryHandlerTests
{
    private readonly IMediator _mediator = Substitute.For<IMediator>();
    private readonly GetReportsOverviewQueryHandler _sut;

    public GetReportsOverviewQueryHandlerTests()
    {
        _sut = new GetReportsOverviewQueryHandler(_mediator, Substitute.For<FSH.Modules.Multitenancy.Contracts.ICurrentBranch>());
    }

    [Fact]
    public async Task Handle_Should_Compose_Kpis_From_Every_Underlying_Module_Query()
    {
        var fromUtc = new DateTime(2026, 1, 1, 0, 0, 0, DateTimeKind.Utc);
        var toUtc = new DateTime(2026, 1, 31, 0, 0, 0, DateTimeKind.Utc);

        _mediator.Send(Arg.Is<GetSalesStatsQuery>(q => q.DateFromUtc == fromUtc && q.DateToUtc == toUtc), Arg.Any<CancellationToken>())
            .Returns(new SalesStatsDto(10, 5000m, 200m, 500m));
        _mediator.Send(Arg.Any<GetStockValuationQuery>(), Arg.Any<CancellationToken>())
            .Returns(12345.67m);
        _mediator.Send(Arg.Any<GetInventoryDiscrepancyReportQuery>(), Arg.Any<CancellationToken>())
            .Returns(new InventoryDiscrepancyReportDto(DateTime.UtcNow, 50, 3, []));
        _mediator.Send(Arg.Any<GetPrescriptionStatsQuery>(), Arg.Any<CancellationToken>())
            .Returns(new PrescriptionStatsDto(20, 5, 2, 12, 1));
        _mediator.Send(Arg.Is<GetTrialBalanceQuery>(q => q.AsOfUtc == toUtc), Arg.Any<CancellationToken>())
            .Returns(new List<TrialBalanceLineDto>
            {
                new(Guid.CreateVersion7(), "1000", "Cash", "Asset", 1000m, 400m, 600m),
                new(Guid.CreateVersion7(), "4000", "Sales Revenue", "Revenue", 100m, 900m, -800m),
            });

        var result = await _sut.Handle(new GetReportsOverviewQuery(fromUtc, toUtc), CancellationToken.None);

        result.FromUtc.ShouldBe(fromUtc);
        result.ToUtc.ShouldBe(toUtc);
        result.SaleCount.ShouldBe(10);
        result.TotalRevenue.ShouldBe(5000m);
        result.TotalDiscount.ShouldBe(200m);
        result.AverageSaleAmount.ShouldBe(500m);
        result.InventoryValuation.ShouldBe(12345.67m);
        result.TotalMedicines.ShouldBe(50);
        result.LowStockCount.ShouldBe(3);
        result.PrescriptionsTotal.ShouldBe(20);
        result.PrescriptionsPending.ShouldBe(5);
        result.PrescriptionsPartiallyFilled.ShouldBe(2);
        result.PrescriptionsFilled.ShouldBe(12);
        result.PrescriptionsCancelled.ShouldBe(1);
        result.TrialBalanceTotalDebit.ShouldBe(1100m);
        result.TrialBalanceTotalCredit.ShouldBe(1300m);
    }

    [Fact]
    public async Task Handle_Should_Throw_When_Query_Is_Null()
    {
        await Should.ThrowAsync<ArgumentNullException>(async () => await _sut.Handle(null!, CancellationToken.None));
    }
}

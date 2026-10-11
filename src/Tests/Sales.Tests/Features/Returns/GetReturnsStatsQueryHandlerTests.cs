using FSH.Modules.Sales.Contracts.v1.Returns;
using FSH.Modules.Sales.Data;
using FSH.Modules.Sales.Domain;
using FSH.Modules.Sales.Features.v1.Returns.GetReturnsStats;
using NSubstitute;
using Shouldly;
using Xunit;

namespace Sales.Tests.Features.Returns;

public sealed class GetReturnsStatsQueryHandlerTests : IDisposable
{
    private readonly SalesDbContext _db = SalesDbContextFactory.Create();
    private readonly GetReturnsStatsQueryHandler _sut;

    public GetReturnsStatsQueryHandlerTests()
    {
        _sut = new GetReturnsStatsQueryHandler(_db, Substitute.For<FSH.Modules.Multitenancy.Contracts.ICurrentBranch>());
    }

    private void SeedReturn(ReturnStatus status, decimal quantity, decimal unitPrice)
    {
        var saleReturn = SaleReturn.Create(Guid.CreateVersion7(), 
            Guid.CreateVersion7(), Guid.CreateVersion7(), DateTime.UtcNow, status, "Defective item", null);
        saleReturn.AddItem(
            Guid.CreateVersion7(), Guid.CreateVersion7(), quantity, unitPrice, unitPrice * 0.6m,
            "Defective item", PackagingCondition.Sealed);
        _db.SaleReturns.Add(saleReturn);
    }

    [Fact]
    public async Task Handle_Should_AggregateCountsByStatus_And_SumTotalReturnAmount()
    {
        // Arrange — 2 pending (60 + 40), 1 approved (100), 1 rejected (50), 1 completed (200).
        SeedReturn(ReturnStatus.Pending, 3m, 20m);   // 60
        SeedReturn(ReturnStatus.Pending, 4m, 10m);   // 40
        SeedReturn(ReturnStatus.Approved, 5m, 20m);  // 100
        SeedReturn(ReturnStatus.Rejected, 5m, 10m);  // 50
        SeedReturn(ReturnStatus.Completed, 10m, 20m); // 200
        await _db.SaveChangesAsync(CancellationToken.None);

        // Act
        var result = await _sut.Handle(new GetReturnsStatsQuery(), CancellationToken.None);

        // Assert
        result.Total.ShouldBe(5);
        result.Pending.ShouldBe(2);
        result.Approved.ShouldBe(1);
        result.Rejected.ShouldBe(1);
        result.Completed.ShouldBe(1);
        result.TotalRefundAmount.ShouldBe(450m); // 60 + 40 + 100 + 50 + 200
    }

    [Fact]
    public async Task Handle_Should_ReturnZeroedStats_When_NoReturnsExist()
    {
        // Act
        var result = await _sut.Handle(new GetReturnsStatsQuery(), CancellationToken.None);

        // Assert
        result.Total.ShouldBe(0);
        result.Pending.ShouldBe(0);
        result.Approved.ShouldBe(0);
        result.Rejected.ShouldBe(0);
        result.Completed.ShouldBe(0);
        result.TotalRefundAmount.ShouldBe(0m);
    }

    public void Dispose() => _db.Dispose();
}

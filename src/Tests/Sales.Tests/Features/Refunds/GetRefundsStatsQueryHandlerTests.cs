using FSH.Modules.Sales.Contracts.v1.Refunds;
using FSH.Modules.Sales.Data;
using FSH.Modules.Sales.Domain;
using FSH.Modules.Sales.Features.v1.Refunds.GetRefundsStats;
using NSubstitute;
using Shouldly;
using Xunit;

namespace Sales.Tests.Features.Refunds;

public sealed class GetRefundsStatsQueryHandlerTests : IDisposable
{
    private readonly SalesDbContext _db = SalesDbContextFactory.Create();
    private readonly GetRefundsStatsQueryHandler _sut;

    public GetRefundsStatsQueryHandlerTests()
    {
        _sut = new GetRefundsStatsQueryHandler(_db, Substitute.For<FSH.Modules.Multitenancy.Contracts.ICurrentBranch>());
    }

    private void SeedRefund(RefundStatus status, decimal quantity, decimal unitPrice, decimal taxRefundAmount = 0m, decimal processingFee = 0m)
    {
        var refund = SaleRefund.Create(Guid.CreateVersion7(), 
            Guid.CreateVersion7(), Guid.CreateVersion7(), DateTime.UtcNow, status, "Customer request",
            "partial_refund", "original_payment", taxRefundAmount, processingFee, null);
        refund.AddItem(Guid.CreateVersion7(), Guid.CreateVersion7(), quantity, unitPrice);
        _db.SaleRefunds.Add(refund);
    }

    [Fact]
    public async Task Handle_Should_AggregateCountsByStatus_And_SumOnlyCompletedRefunds()
    {
        // Arrange — items total 60 (pending), 40 (pending), 100 + 10 tax (approved) = 110,
        // 50 - 5 fee (rejected) = 45, 200 (completed).
        SeedRefund(RefundStatus.Pending, 3m, 20m);                               // 60
        SeedRefund(RefundStatus.Pending, 4m, 10m);                               // 40
        SeedRefund(RefundStatus.Approved, 5m, 20m, taxRefundAmount: 10m);        // 110
        SeedRefund(RefundStatus.Rejected, 5m, 10m, processingFee: 5m);           // 45
        SeedRefund(RefundStatus.Completed, 10m, 20m);                           // 200
        await _db.SaveChangesAsync(CancellationToken.None);

        // Act
        var result = await _sut.Handle(new GetRefundsStatsQuery(), CancellationToken.None);

        // Assert
        result.Total.ShouldBe(5);
        result.Pending.ShouldBe(2);
        result.Approved.ShouldBe(1);
        result.Rejected.ShouldBe(1);
        result.Completed.ShouldBe(1);
        result.TotalRefundAmount.ShouldBe(200m); // only the completed refund has been paid out
    }

    [Fact]
    public async Task Handle_Should_ReturnZeroedStats_When_NoRefundsExist()
    {
        // Act
        var result = await _sut.Handle(new GetRefundsStatsQuery(), CancellationToken.None);

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

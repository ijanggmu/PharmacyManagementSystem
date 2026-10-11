using FSH.Modules.Sales.Contracts.v1.Ird;
using FSH.Modules.Sales.Data;
using FSH.Modules.Sales.Domain;
using FSH.Modules.Sales.Features.v1.Ird.GetIrdQueueHealth;
using Sales.Tests.Features;

namespace Sales.Tests.Features.Ird;

public sealed class GetIrdQueueHealthQueryHandlerTests : IDisposable
{
    private readonly SalesDbContext _db = SalesDbContextFactory.Create();
    private readonly GetIrdQueueHealthQueryHandler _sut;

    public GetIrdQueueHealthQueryHandlerTests()
    {
        _sut = new GetIrdQueueHealthQueryHandler(_db);
    }

    [Fact]
    public async Task Handle_Should_Return_Zeros_When_Queue_Empty()
    {
        var result = await _sut.Handle(new GetIrdQueueHealthQuery(), CancellationToken.None);

        result.PendingCount.ShouldBe(0);
        result.FailedCount.ShouldBe(0);
        result.SalesFailedCount.ShouldBe(0);
        result.RecentFailed.ShouldBeEmpty();
    }

    [Fact]
    public async Task Handle_Should_Count_Pending_And_Failed_Queue_Items_Separately()
    {
        // Arrange
        var pending = IrdInvoiceQueueEntry.Enqueue(Guid.CreateVersion7(), "{}");
        var failing = IrdInvoiceQueueEntry.Enqueue(Guid.CreateVersion7(), "{}");
        failing.BeginAttempt();
        failing.MarkFailed("dispatch not configured", isFinal: true, nextAttemptAtUtc: null);

        _db.IrdInvoiceQueues.AddRange(pending, failing);
        await _db.SaveChangesAsync(CancellationToken.None);

        // Act
        var result = await _sut.Handle(new GetIrdQueueHealthQuery(), CancellationToken.None);

        // Assert
        result.PendingCount.ShouldBe(1);
        result.FailedCount.ShouldBe(1);
        result.RecentFailed.ShouldHaveSingleItem();
        result.RecentFailed[0].LastError.ShouldBe("dispatch not configured");
    }

    [Fact]
    public async Task Handle_Should_Count_Sales_Flagged_IrdStatus_Failed()
    {
        // Arrange
        var sale = Sale.StartBuilding(Guid.CreateVersion7(), null, null, null);
        sale.AddItem(Guid.CreateVersion7(), 1m, 5m, 0m, 0m, 2m);
        sale.Finalize("Cash", sale.TotalAmount);
        sale.MarkIrdDispatchFailed("permanent failure", isFinalAttempt: true);
        _db.Sales.Add(sale);
        await _db.SaveChangesAsync(CancellationToken.None);

        // Act
        var result = await _sut.Handle(new GetIrdQueueHealthQuery(), CancellationToken.None);

        // Assert
        result.SalesFailedCount.ShouldBe(1);
    }

    public void Dispose() => _db.Dispose();
}

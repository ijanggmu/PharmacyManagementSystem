using FSH.Modules.Sales.Data;
using FSH.Modules.Sales.Domain;
using FSH.Modules.Sales.Jobs;
using FSH.Modules.Sales.Services;
using Microsoft.Extensions.Logging;
using NSubstitute;
using Sales.Tests.Features;

namespace Sales.Tests.Jobs;

public sealed class ProcessIrdInvoiceQueueJobTests : IDisposable
{
    private readonly SalesDbContext _db = SalesDbContextFactory.Create();
    private readonly IIrdDispatchClient _dispatchClient = Substitute.For<IIrdDispatchClient>();
    private readonly ILogger<ProcessIrdInvoiceQueueJob> _logger = Substitute.For<ILogger<ProcessIrdInvoiceQueueJob>>();
    private readonly ProcessIrdInvoiceQueueJob _sut;

    public ProcessIrdInvoiceQueueJobTests()
    {
        _sut = new ProcessIrdInvoiceQueueJob(_db, _dispatchClient, _logger);
    }

    private async Task<Sale> SeedSaleAsync()
    {
        var sale = Sale.StartBuilding(Guid.CreateVersion7(), null, null, null);
        sale.AddItem(Guid.CreateVersion7(), 1m, 10m, 0m, 0m, 4m);
        sale.Finalize("Cash", sale.TotalAmount);
        sale.AssignInvoiceNumberIfMissing("INV-260915-0001");
        _db.Sales.Add(sale);
        await _db.SaveChangesAsync(CancellationToken.None);
        return sale;
    }

    [Fact]
    public async Task RunAsync_Should_Do_Nothing_When_Queue_Empty()
    {
        await _sut.RunAsync(CancellationToken.None);

        _db.IrdInvoiceQueues.Count().ShouldBe(0);
    }

    [Fact]
    public async Task RunAsync_Should_Mark_Sent_And_Sync_Sale_On_Success()
    {
        // Arrange
        var sale = await SeedSaleAsync();
        var item = IrdInvoiceQueueEntry.Enqueue(sale.Id, "{\"invoiceNumber\":\"INV-260915-0001\"}");
        _db.IrdInvoiceQueues.Add(item);
        await _db.SaveChangesAsync(CancellationToken.None);

        _dispatchClient.SendInvoiceAsync(Arg.Any<string>(), Arg.Any<string>(), Arg.Any<CancellationToken>())
            .Returns(new IrdDispatchResult(true, "EXT-1", null, false));

        // Act
        await _sut.RunAsync(CancellationToken.None);

        // Assert
        var reloadedItem = _db.IrdInvoiceQueues.Single(q => q.Id == item.Id);
        reloadedItem.Status.ShouldBe(IrdQueueStatus.Sent);
        reloadedItem.Attempts.ShouldBe(1);

        var reloadedSale = await _db.Sales.FindAsync(sale.Id);
        reloadedSale!.IrdStatus.ShouldBe(IrdSyncStatus.Synced);
        reloadedSale.IrdInvoiceId.ShouldBe("EXT-1");
    }

    [Fact]
    public async Task RunAsync_Should_Fail_Permanently_And_Not_Set_NextAttempt_When_IsPermanentFailure()
    {
        // Arrange — mirrors NoOpIrdDispatchClient's always-permanent-failure behavior.
        var sale = await SeedSaleAsync();
        var item = IrdInvoiceQueueEntry.Enqueue(sale.Id, "{}");
        _db.IrdInvoiceQueues.Add(item);
        await _db.SaveChangesAsync(CancellationToken.None);

        _dispatchClient.SendInvoiceAsync(Arg.Any<string>(), Arg.Any<string>(), Arg.Any<CancellationToken>())
            .Returns(new IrdDispatchResult(false, null, "not configured", true));

        // Act
        await _sut.RunAsync(CancellationToken.None);

        // Assert
        var reloadedItem = _db.IrdInvoiceQueues.Single(q => q.Id == item.Id);
        reloadedItem.Status.ShouldBe(IrdQueueStatus.Failed);
        reloadedItem.NextAttemptAtUtc.ShouldBeNull();
        reloadedItem.LastError.ShouldBe("not configured");

        var reloadedSale = await _db.Sales.FindAsync(sale.Id);
        reloadedSale!.IrdStatus.ShouldBe(IrdSyncStatus.Failed);
    }

    [Fact]
    public async Task RunAsync_Should_Retry_With_Backoff_When_Transient_Failure()
    {
        // Arrange
        var sale = await SeedSaleAsync();
        var item = IrdInvoiceQueueEntry.Enqueue(sale.Id, "{}");
        _db.IrdInvoiceQueues.Add(item);
        await _db.SaveChangesAsync(CancellationToken.None);

        _dispatchClient.SendInvoiceAsync(Arg.Any<string>(), Arg.Any<string>(), Arg.Any<CancellationToken>())
            .Returns(new IrdDispatchResult(false, null, "transient network error", false));

        // Act
        var before = DateTime.UtcNow;
        await _sut.RunAsync(CancellationToken.None);

        // Assert — first attempt, not final: stays Pending with a ~1-minute backoff.
        var reloadedItem = _db.IrdInvoiceQueues.Single(q => q.Id == item.Id);
        reloadedItem.Status.ShouldBe(IrdQueueStatus.Pending);
        reloadedItem.Attempts.ShouldBe(1);
        reloadedItem.NextAttemptAtUtc.ShouldNotBeNull();
        reloadedItem.NextAttemptAtUtc!.Value.ShouldBeGreaterThan(before);

        var reloadedSale = await _db.Sales.FindAsync(sale.Id);
        reloadedSale!.IrdStatus.ShouldBe(IrdSyncStatus.Pending);
        reloadedSale.IrdError.ShouldBe("transient network error");
    }

    [Fact]
    public async Task RunAsync_Should_Fail_Permanently_After_MaxAttempts_Even_When_Not_Flagged_Permanent()
    {
        // Arrange — simulate an item that has already retried 4 times (one below MaxAttempts=5).
        var sale = await SeedSaleAsync();
        var item = IrdInvoiceQueueEntry.Enqueue(sale.Id, "{}");
        for (int i = 0; i < 4; i++)
        {
            item.BeginAttempt();
            item.MarkFailed("retryable", isFinal: false, nextAttemptAtUtc: DateTime.UtcNow.AddMinutes(-1));
        }

        _db.IrdInvoiceQueues.Add(item);
        await _db.SaveChangesAsync(CancellationToken.None);

        _dispatchClient.SendInvoiceAsync(Arg.Any<string>(), Arg.Any<string>(), Arg.Any<CancellationToken>())
            .Returns(new IrdDispatchResult(false, null, "still failing", false));

        // Act — this is the 5th attempt.
        await _sut.RunAsync(CancellationToken.None);

        // Assert
        var reloadedItem = _db.IrdInvoiceQueues.Single(q => q.Id == item.Id);
        reloadedItem.Attempts.ShouldBe(5);
        reloadedItem.Status.ShouldBe(IrdQueueStatus.Failed);
        reloadedItem.NextAttemptAtUtc.ShouldBeNull();
    }

    [Fact]
    public async Task RunAsync_Should_Skip_Items_Not_Yet_Due_For_Retry()
    {
        // Arrange — a Pending item whose NextAttemptAtUtc is still in the future must not be picked up.
        var sale = await SeedSaleAsync();
        var item = IrdInvoiceQueueEntry.Enqueue(sale.Id, "{}");
        item.BeginAttempt();
        item.MarkFailed("retryable", isFinal: false, nextAttemptAtUtc: DateTime.UtcNow.AddHours(1));
        _db.IrdInvoiceQueues.Add(item);
        await _db.SaveChangesAsync(CancellationToken.None);

        // Act
        await _sut.RunAsync(CancellationToken.None);

        // Assert — still 1 attempt (the manual seed above), dispatch client never called.
        await _dispatchClient.DidNotReceive().SendInvoiceAsync(Arg.Any<string>(), Arg.Any<string>(), Arg.Any<CancellationToken>());
        var reloadedItem = _db.IrdInvoiceQueues.Single(q => q.Id == item.Id);
        reloadedItem.Attempts.ShouldBe(1);
    }

    public void Dispose() => _db.Dispose();
}

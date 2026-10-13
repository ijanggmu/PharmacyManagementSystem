using System.Text.Json;
using FSH.Framework.Eventing.Abstractions;
using FSH.Modules.Sales.Data;
using FSH.Modules.Sales.Domain;
using FSH.Modules.Sales.Jobs;
using FSH.Modules.Sales.Services;
using FSH.Modules.Sales.Services.Ird;
using Microsoft.AspNetCore.DataProtection;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
using NSubstitute;
using Sales.Tests.Features;

namespace Sales.Tests.Jobs;

public sealed class ProcessIrdInvoiceQueueJobTests : IDisposable
{
    private readonly SalesDbContext _db = SalesDbContextFactory.Create();
    private readonly IIrdDispatchClient _dispatchClient = Substitute.For<IIrdDispatchClient>();
    private readonly ILogger<ProcessIrdInvoiceQueueJob> _logger = Substitute.For<ILogger<ProcessIrdInvoiceQueueJob>>();
    private readonly IrdSecrets _secrets = new(new EphemeralDataProtectionProvider());
    private readonly IrdOptions _options = new();
    private readonly List<IrdDispatchRequest> _requests = [];
    private readonly ProcessIrdInvoiceQueueJob _sut;

    public ProcessIrdInvoiceQueueJobTests()
    {
        // Each tenant is processed in a fresh DI scope; here that scope hands back the same InMemory context.
        var provider = Substitute.For<IServiceProvider>();
        provider.GetService(typeof(SalesDbContext)).Returns(_db);
        var scope = Substitute.For<IServiceScope>();
        scope.ServiceProvider.Returns(provider);
        var scopeFactory = Substitute.For<IServiceScopeFactory>();
        scopeFactory.CreateScope().Returns(scope);
        var monitor = Substitute.For<IOptionsMonitor<IrdOptions>>();
        monitor.CurrentValue.Returns(_options);
        _sut = new ProcessIrdInvoiceQueueJob(
            _db, _dispatchClient, scopeFactory, Substitute.For<IEventTenantScope>(), _secrets, monitor, _logger);

        RespondWith(new IrdDispatchResult(true, null, null, false, "200"));
        SeedSettings(enabled: true);
    }

    private void RespondWith(IrdDispatchResult result) =>
        _dispatchClient.SendAsync(Arg.Do<IrdDispatchRequest>(r => _requests.Add(r)), Arg.Any<CancellationToken>())
            .Returns(result);

    private void SeedSettings(bool enabled)
    {
        var settings = IrdSettings.CreateDefault();
        settings.Update(enabled, "https://cbms.example.test", "pharma-api", _secrets.ProtectOrKeep("s3cret"), "123456789", 10_000m);
        _db.IrdSettings.Add(settings);
        _db.SaveChanges();
    }

    private async Task<Sale> SeedSaleAsync()
    {
        var sale = Sale.StartBuilding(Guid.CreateVersion7(), null, null, null);
        sale.AddItem(Guid.CreateVersion7(), 1m, 113m, 0m, 0m, 4m);
        sale.Finalize("Cash", sale.TotalAmount);
        sale.ApplyVat(13m);
        sale.AssignInvoice("INV-MAIN-2083/84-00001", 2083);
        _db.Sales.Add(sale);
        await _db.SaveChangesAsync(CancellationToken.None);
        return sale;
    }

    private async Task<IrdInvoiceQueueEntry> QueueBillAsync(Sale sale, DateTime? issuedAtUtc = null)
    {
        var item = IrdInvoiceQueueEntry.Enqueue(
            sale.Id, CbmsPayloadBuilder.Serialize(CbmsPayloadBuilder.ForSale(sale, "Ram")), sale.InvoiceNumber, issuedAtUtc ?? DateTime.UtcNow);
        _db.IrdInvoiceQueues.Add(item);
        await _db.SaveChangesAsync(CancellationToken.None);
        return item;
    }

    private async Task<IrdInvoiceQueueEntry> QueueReturnAsync(Sale sale)
    {
        var document = CbmsPayloadBuilder.ForReturn(new CbmsReturnInput(
            sale.InvoiceNumber!, "CN-MAIN-2083/84-00001", DateTime.UtcNow, 2083, "Damaged", 113m, 100m, 13m, 0m, 13m, "Ram", null));
        var item = IrdInvoiceQueueEntry.EnqueueDocument(
            sale.Id, IrdDocumentType.Return, Guid.CreateVersion7(), "CN-MAIN-2083/84-00001", DateTime.UtcNow,
            CbmsPayloadBuilder.Serialize(document));
        _db.IrdInvoiceQueues.Add(item);
        await _db.SaveChangesAsync(CancellationToken.None);
        return item;
    }

    [Fact]
    public async Task RunAsync_Should_Do_Nothing_When_Queue_Empty()
    {
        await _sut.RunAsync(CancellationToken.None);

        _db.IrdInvoiceQueues.Count().ShouldBe(0);
        _requests.ShouldBeEmpty();
    }

    [Fact]
    public async Task RunAsync_Should_Post_Bill_With_Credentials_And_Mark_Sent_Realtime()
    {
        var sale = await SeedSaleAsync();
        var item = await QueueBillAsync(sale);

        await _sut.RunAsync(CancellationToken.None);

        var request = _requests.ShouldHaveSingleItem();
        request.Endpoint.ShouldBe(new Uri("https://cbms.example.test/api/bill"));
        using var body = JsonDocument.Parse(request.Body);
        body.RootElement.GetProperty("username").GetString().ShouldBe("pharma-api");
        body.RootElement.GetProperty("password").GetString().ShouldBe("s3cret");
        body.RootElement.GetProperty("seller_pan").GetString().ShouldBe("123456789");
        body.RootElement.GetProperty("invoice_number").GetString().ShouldBe("INV-MAIN-2083/84-00001");
        body.RootElement.GetProperty("isrealtime").GetBoolean().ShouldBeTrue();

        var reloaded = _db.IrdInvoiceQueues.Single(q => q.Id == item.Id);
        reloaded.Status.ShouldBe(IrdQueueStatus.Sent);
        reloaded.Attempts.ShouldBe(1);
        reloaded.ResponseCode.ShouldBe("200");
        reloaded.IsRealtime.ShouldBe(true);
        reloaded.SentAtUtc.ShouldNotBeNull();
        (await _db.Sales.FindAsync(sale.Id))!.IrdStatus.ShouldBe(IrdSyncStatus.Synced);
    }

    [Fact]
    public async Task RunAsync_Should_Report_Not_Realtime_When_Sent_After_The_Window()
    {
        var sale = await SeedSaleAsync();
        var item = await QueueBillAsync(sale, DateTime.UtcNow.AddSeconds(-(_options.RealtimeWindowSeconds + 60)));

        await _sut.RunAsync(CancellationToken.None);

        using var body = JsonDocument.Parse(_requests.ShouldHaveSingleItem().Body);
        body.RootElement.GetProperty("isrealtime").GetBoolean().ShouldBeFalse();
        _db.IrdInvoiceQueues.Single(q => q.Id == item.Id).IsRealtime.ShouldBe(false);
    }

    [Fact]
    public async Task RunAsync_Should_Send_Bill_Before_Its_Credit_Note_To_The_BillReturn_Endpoint()
    {
        var sale = await SeedSaleAsync();
        await QueueBillAsync(sale);
        var credit = await QueueReturnAsync(sale);

        await _sut.RunAsync(CancellationToken.None);

        _requests.Select(r => r.Endpoint.AbsolutePath).ShouldBe(["/api/bill", "/api/billreturn"]);
        using var body = JsonDocument.Parse(_requests[1].Body);
        body.RootElement.GetProperty("ref_invoice_number").GetString().ShouldBe("INV-MAIN-2083/84-00001");
        body.RootElement.GetProperty("credit_note_number").GetString().ShouldBe("CN-MAIN-2083/84-00001");
        _db.IrdInvoiceQueues.Single(q => q.Id == credit.Id).Status.ShouldBe(IrdQueueStatus.Sent);
    }

    [Fact]
    public async Task RunAsync_Should_Defer_A_Credit_Note_While_Its_Bill_Is_Not_Synced()
    {
        var sale = await SeedSaleAsync();
        var bill = await QueueBillAsync(sale);
        bill.BeginAttempt(); // in flight elsewhere (recent, so not reclaimed)
        await _db.SaveChangesAsync(CancellationToken.None);
        var credit = await QueueReturnAsync(sale);

        await _sut.RunAsync(CancellationToken.None);

        _requests.ShouldBeEmpty();
        var reloaded = _db.IrdInvoiceQueues.Single(q => q.Id == credit.Id);
        reloaded.Status.ShouldBe(IrdQueueStatus.Pending);
        reloaded.Attempts.ShouldBe(0);
        reloaded.NextAttemptAtUtc.ShouldNotBeNull();
        reloaded.NextAttemptAtUtc!.Value.ShouldBeGreaterThan(DateTime.UtcNow);
    }

    [Fact]
    public async Task RunAsync_Should_Fail_Permanently_Without_Calling_Cbms_When_EBilling_Is_Off()
    {
        _db.IrdSettings.Single().Update(false, null, "pharma-api", null, "123456789", 10_000m);
        await _db.SaveChangesAsync(CancellationToken.None);
        var sale = await SeedSaleAsync();
        var item = await QueueBillAsync(sale);

        await _sut.RunAsync(CancellationToken.None);

        _requests.ShouldBeEmpty();
        var reloaded = _db.IrdInvoiceQueues.Single(q => q.Id == item.Id);
        reloaded.Status.ShouldBe(IrdQueueStatus.Failed);
        reloaded.LastError!.ShouldContain("turned off");
        (await _db.Sales.FindAsync(sale.Id))!.IrdStatus.ShouldBe(IrdSyncStatus.Failed);
    }

    [Fact]
    public async Task RunAsync_Should_Fail_Permanently_And_Record_Code_When_IsPermanentFailure()
    {
        RespondWith(new IrdDispatchResult(false, null, "credentials", true, "100"));
        var sale = await SeedSaleAsync();
        var item = await QueueBillAsync(sale);

        await _sut.RunAsync(CancellationToken.None);

        var reloaded = _db.IrdInvoiceQueues.Single(q => q.Id == item.Id);
        reloaded.Status.ShouldBe(IrdQueueStatus.Failed);
        reloaded.NextAttemptAtUtc.ShouldBeNull();
        reloaded.LastError.ShouldBe("credentials");
        reloaded.ResponseCode.ShouldBe("100");
        (await _db.Sales.FindAsync(sale.Id))!.IrdStatus.ShouldBe(IrdSyncStatus.Failed);
    }

    [Fact]
    public async Task RunAsync_Should_Retry_With_Backoff_When_Transient_Failure()
    {
        RespondWith(new IrdDispatchResult(false, null, "transient network error", false, "103"));
        var sale = await SeedSaleAsync();
        var item = await QueueBillAsync(sale);

        var before = DateTime.UtcNow;
        await _sut.RunAsync(CancellationToken.None);

        var reloaded = _db.IrdInvoiceQueues.Single(q => q.Id == item.Id);
        reloaded.Status.ShouldBe(IrdQueueStatus.Pending);
        reloaded.Attempts.ShouldBe(1);
        reloaded.LastAttemptAtUtc.ShouldNotBeNull();
        reloaded.NextAttemptAtUtc!.Value.ShouldBeGreaterThan(before);

        var reloadedSale = await _db.Sales.FindAsync(sale.Id);
        reloadedSale!.IrdStatus.ShouldBe(IrdSyncStatus.Pending);
        reloadedSale.IrdError.ShouldBe("transient network error");
    }

    [Fact]
    public async Task RunAsync_Should_Fail_Permanently_After_MaxAttempts_Even_When_Not_Flagged_Permanent()
    {
        RespondWith(new IrdDispatchResult(false, null, "still failing", false));
        var sale = await SeedSaleAsync();
        var item = await QueueBillAsync(sale);
        for (int i = 0; i < 4; i++)
        {
            item.BeginAttempt();
            item.MarkFailed("retryable", isFinal: false, nextAttemptAtUtc: DateTime.UtcNow.AddMinutes(-1));
        }

        await _db.SaveChangesAsync(CancellationToken.None);

        await _sut.RunAsync(CancellationToken.None);

        var reloaded = _db.IrdInvoiceQueues.Single(q => q.Id == item.Id);
        reloaded.Attempts.ShouldBe(5);
        reloaded.Status.ShouldBe(IrdQueueStatus.Failed);
        reloaded.NextAttemptAtUtc.ShouldBeNull();
    }

    [Fact]
    public async Task RunAsync_Should_Send_Again_After_A_Manual_Resend()
    {
        RespondWith(new IrdDispatchResult(false, null, "credentials", true, "100"));
        var sale = await SeedSaleAsync();
        var item = await QueueBillAsync(sale);
        await _sut.RunAsync(CancellationToken.None);
        _db.IrdInvoiceQueues.Single(q => q.Id == item.Id).Status.ShouldBe(IrdQueueStatus.Failed);

        RespondWith(new IrdDispatchResult(true, null, null, false, "200"));
        _db.IrdInvoiceQueues.Single(q => q.Id == item.Id).Resend();
        await _db.SaveChangesAsync(CancellationToken.None);
        await _sut.RunForTenantAsync("test-tenant", CancellationToken.None);

        var reloaded = _db.IrdInvoiceQueues.Single(q => q.Id == item.Id);
        reloaded.Status.ShouldBe(IrdQueueStatus.Sent);
        reloaded.Attempts.ShouldBe(1);
        (await _db.Sales.FindAsync(sale.Id))!.IrdStatus.ShouldBe(IrdSyncStatus.Synced);
    }

    [Fact]
    public async Task RunAsync_Should_Skip_Items_Not_Yet_Due_For_Retry()
    {
        var sale = await SeedSaleAsync();
        var item = await QueueBillAsync(sale);
        item.BeginAttempt();
        item.MarkFailed("retryable", isFinal: false, nextAttemptAtUtc: DateTime.UtcNow.AddHours(1));
        await _db.SaveChangesAsync(CancellationToken.None);

        await _sut.RunAsync(CancellationToken.None);

        _requests.ShouldBeEmpty();
        _db.IrdInvoiceQueues.Single(q => q.Id == item.Id).Attempts.ShouldBe(1);
    }

    [Fact]
    public async Task RunAsync_Should_Settle_Without_Dispatch_When_Sale_Already_Synced()
    {
        var sale = await SeedSaleAsync();
        sale.MarkIrdSynced("EXT-1");
        var item = await QueueBillAsync(sale);

        await _sut.RunAsync(CancellationToken.None);

        _db.IrdInvoiceQueues.Single(q => q.Id == item.Id).Status.ShouldBe(IrdQueueStatus.Sent);
        _requests.ShouldBeEmpty();
    }

    [Fact]
    public async Task RunAsync_Should_Still_Send_The_Bill_Of_A_Sale_Cancelled_After_Queueing()
    {
        // The invoice was issued, so IRD gets it; the cancellation follows as a bill-return.
        var sale = await SeedSaleAsync();
        var item = await QueueBillAsync(sale);
        sale.Cancel("void");
        await _db.SaveChangesAsync(CancellationToken.None);

        await _sut.RunAsync(CancellationToken.None);

        _db.IrdInvoiceQueues.Single(q => q.Id == item.Id).Status.ShouldBe(IrdQueueStatus.Sent);
        _requests.ShouldHaveSingleItem().Endpoint.AbsolutePath.ShouldBe("/api/bill");
    }

    [Fact]
    public async Task RunAsync_Should_Rebuild_A_Legacy_Payload_From_The_Sale()
    {
        var sale = await SeedSaleAsync();
        _db.IrdInvoiceQueues.Add(IrdInvoiceQueueEntry.Enqueue(sale.Id, "{\"invoiceNumber\":\"INV-MAIN-2083/84-00001\"}"));
        await _db.SaveChangesAsync(CancellationToken.None);

        await _sut.RunAsync(CancellationToken.None);

        using var body = JsonDocument.Parse(_requests.ShouldHaveSingleItem().Body);
        body.RootElement.GetProperty("invoice_number").GetString().ShouldBe("INV-MAIN-2083/84-00001");
        body.RootElement.GetProperty("total_sales").GetDecimal().ShouldBe(113m);
        body.RootElement.TryGetProperty("invoiceNumber", out _).ShouldBeFalse();
    }

    [Fact]
    public async Task RunAsync_Should_Reclaim_An_Item_Stuck_In_Processing_Past_Its_Lease()
    {
        var sale = await SeedSaleAsync();
        var item = await QueueBillAsync(sale);
        item.BeginAttempt();
        await _db.SaveChangesAsync(CancellationToken.None);
        _db.Entry(item).Property(nameof(IrdInvoiceQueueEntry.UpdatedAtUtc)).CurrentValue =
            DateTime.UtcNow - ProcessIrdInvoiceQueueJob.ProcessingLease - TimeSpan.FromMinutes(1);
        await _db.SaveChangesAsync(CancellationToken.None);

        await _sut.RunAsync(CancellationToken.None);

        var reloaded = _db.IrdInvoiceQueues.Single(q => q.Id == item.Id);
        reloaded.Status.ShouldBe(IrdQueueStatus.Sent);
        reloaded.Attempts.ShouldBe(2);
        (await _db.Sales.FindAsync(sale.Id))!.IrdStatus.ShouldBe(IrdSyncStatus.Synced);
    }

    [Fact]
    public async Task RunAsync_Should_Leave_A_Recent_Processing_Item_Alone()
    {
        var sale = await SeedSaleAsync();
        var item = await QueueBillAsync(sale);
        item.BeginAttempt();
        await _db.SaveChangesAsync(CancellationToken.None);

        await _sut.RunAsync(CancellationToken.None);

        _db.IrdInvoiceQueues.Single(q => q.Id == item.Id).Status.ShouldBe(IrdQueueStatus.Processing);
        _requests.ShouldBeEmpty();
    }

    [Theory]
    [InlineData("https://cbapi.ird.gov.np", "api/bill", "https://cbapi.ird.gov.np/api/bill")]
    [InlineData("https://cbapi.ird.gov.np/", "/api/billreturn", "https://cbapi.ird.gov.np/api/billreturn")]
    [InlineData("http://103.1.92.174:9050", "api/bill", "http://103.1.92.174:9050/api/bill")]
    public void TryResolveEndpoint_Should_Join_Base_And_Path(string baseUrl, string path, string expected)
    {
        ProcessIrdInvoiceQueueJob.TryResolveEndpoint(baseUrl, path, out var endpoint).ShouldBeTrue();
        endpoint.ShouldBe(new Uri(expected));
    }

    public void Dispose() => _db.Dispose();
}

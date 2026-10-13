using System.Linq.Expressions;
using System.Text.Json;
using FSH.Framework.Jobs.Services;
using FSH.Modules.Customers.Contracts.Dtos;
using FSH.Modules.Customers.Contracts.v1.Customers;
using FSH.Modules.Sales.Data;
using FSH.Modules.Sales.Domain;
using FSH.Modules.Sales.Jobs;
using FSH.Modules.Sales.Services.Ird;
using Mediator;
using Microsoft.Extensions.Logging;
using NSubstitute;
using Sales.Tests.Features;

namespace Sales.Tests.Services;

public sealed class IrdDocumentEnqueuerTests : IDisposable
{
    private const string Tenant = "test-tenant";
    private readonly SalesDbContext _db = SalesDbContextFactory.Create();
    private readonly IMediator _mediator = Substitute.For<IMediator>();
    private readonly IJobService _jobs = Substitute.For<IJobService>();
    private readonly IrdDocumentEnqueuer _sut;

    public IrdDocumentEnqueuerTests()
    {
        _sut = new IrdDocumentEnqueuer(_db, _mediator, _jobs, Substitute.For<ILogger<IrdDocumentEnqueuer>>());
    }

    private void SeedSettings(bool enabled)
    {
        var settings = IrdSettings.CreateDefault();
        settings.Update(enabled, null, "api", "protected", "123456789", 10_000m);
        _db.IrdSettings.Add(settings);
        _db.SaveChanges();
    }

    private async Task<Sale> SeedSaleAsync(Guid? customerId = null)
    {
        var sale = Sale.StartBuilding(Guid.CreateVersion7(), customerId, null, null);
        sale.AddItem(Guid.CreateVersion7(), 1m, 113m, 0m, 0m, 4m);
        sale.Finalize("Cash", sale.TotalAmount);
        sale.ApplyVat(13m);
        sale.AssignInvoice("INV-MAIN-2083/84-00009", 2083);
        _db.Sales.Add(sale);
        await _db.SaveChangesAsync(CancellationToken.None);
        return sale;
    }

    [Fact]
    public async Task EnqueueBillAsync_Should_Queue_Cbms_Bill_And_Trigger_Dispatch()
    {
        SeedSettings(enabled: true);
        var customerId = Guid.CreateVersion7();
        _mediator.Send(Arg.Any<LookupCustomersQuery>(), Arg.Any<CancellationToken>())
            .Returns(new List<CustomerLookupDto> { new(customerId, "Hari Prasad", null) });
        var sale = await SeedSaleAsync(customerId);

        bool queued = await _sut.EnqueueBillAsync(sale.Id, Tenant, CancellationToken.None);

        queued.ShouldBeTrue();
        var item = _db.IrdInvoiceQueues.ShouldHaveSingleItem();
        item.DocumentType.ShouldBe(IrdDocumentType.Bill);
        item.DocumentId.ShouldBe(sale.Id);
        item.DocumentNumber.ShouldBe("INV-MAIN-2083/84-00009");
        item.Status.ShouldBe(IrdQueueStatus.Pending);
        using var doc = JsonDocument.Parse(item.PayloadJson);
        doc.RootElement.GetProperty("buyer_name").GetString().ShouldBe("Hari Prasad");
        doc.RootElement.TryGetProperty("password", out _).ShouldBeFalse(); // credentials are added at dispatch only
        _jobs.Received(1).Enqueue(Arg.Any<Expression<Func<ProcessIrdInvoiceQueueJob, Task>>>());
    }

    [Fact]
    public async Task EnqueueBillAsync_Should_Do_Nothing_When_EBilling_Is_Off()
    {
        SeedSettings(enabled: false);
        var sale = await SeedSaleAsync();

        (await _sut.EnqueueBillAsync(sale.Id, Tenant, CancellationToken.None)).ShouldBeFalse();

        _db.IrdInvoiceQueues.ShouldBeEmpty();
        _jobs.DidNotReceiveWithAnyArgs().Enqueue(default(Expression<Func<ProcessIrdInvoiceQueueJob, Task>>)!);
    }

    [Fact]
    public async Task EnqueueBillAsync_Should_Be_Idempotent()
    {
        SeedSettings(enabled: true);
        var sale = await SeedSaleAsync();

        await _sut.EnqueueBillAsync(sale.Id, Tenant, CancellationToken.None);
        (await _sut.EnqueueBillAsync(sale.Id, Tenant, CancellationToken.None)).ShouldBeFalse();

        _db.IrdInvoiceQueues.Count().ShouldBe(1);
    }

    [Fact]
    public async Task EnqueueCancellationAsync_Should_Queue_A_Full_Bill_Return()
    {
        SeedSettings(enabled: true);
        var sale = await SeedSaleAsync();
        sale.Cancel("Wrong customer");
        await _db.SaveChangesAsync(CancellationToken.None);

        bool queued = await _sut.EnqueueCancellationAsync(sale.Id, Tenant, CancellationToken.None);

        queued.ShouldBeTrue();
        var item = _db.IrdInvoiceQueues.ShouldHaveSingleItem();
        item.DocumentType.ShouldBe(IrdDocumentType.Return);
        using var doc = JsonDocument.Parse(item.PayloadJson);
        doc.RootElement.GetProperty("ref_invoice_number").GetString().ShouldBe("INV-MAIN-2083/84-00009");
        doc.RootElement.GetProperty("credit_note_number").GetString().ShouldBe("INV-MAIN-2083/84-00009");
        doc.RootElement.GetProperty("reason_for_return").GetString().ShouldBe("Wrong customer");
        doc.RootElement.GetProperty("total_sales").GetDecimal().ShouldBe(113m);
        doc.RootElement.GetProperty("vat").GetDecimal().ShouldBe(13m);
    }

    [Fact]
    public void TriggerDispatch_Should_Swallow_Job_Storage_Failures()
    {
        _jobs.Enqueue(Arg.Any<Expression<Func<ProcessIrdInvoiceQueueJob, Task>>>())
            .Returns(_ => throw new InvalidOperationException("hangfire down"));

        Should.NotThrow(() => _sut.TriggerDispatch(Tenant));
    }

    public void Dispose() => _db.Dispose();
}

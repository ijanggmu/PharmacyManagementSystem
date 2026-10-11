using FSH.Framework.Core.Exceptions;
using FSH.Modules.Sales.Contracts.Fiscal;
using FSH.Modules.Sales.Contracts.v1.Ird;
using FSH.Modules.Sales.Data;
using FSH.Modules.Sales.Domain;
using FSH.Modules.Sales.Features.v1.Ird.SendIrdInvoice;
using FSH.Modules.Sales.Services;
using NSubstitute;
using Sales.Tests.Features;

namespace Sales.Tests.Features.Ird;

public sealed class SendIrdInvoiceCommandHandlerTests : IDisposable
{
    private readonly SalesDbContext _db = SalesDbContextFactory.Create();
    private readonly IInvoiceNumberService _invoiceNumbers = Substitute.For<IInvoiceNumberService>();
    private readonly SendIrdInvoiceCommandHandler _sut;

    public SendIrdInvoiceCommandHandlerTests()
    {
        _invoiceNumbers.ResolveContextAsync(Arg.Any<Guid>(), Arg.Any<CancellationToken>())
            .Returns(new InvoiceNumberContext("INV", "MAIN"));
        _invoiceNumbers.ReserveNextAsync(Arg.Any<Guid>(), Arg.Any<int>(), Arg.Any<CancellationToken>())
            .Returns(7, 8, 9);
        _sut = new SendIrdInvoiceCommandHandler(_db, _invoiceNumbers, Substitute.For<FSH.Modules.Multitenancy.Contracts.ICurrentBranch>());
    }

    [Fact]
    public async Task Handle_Should_Throw_NotFound_When_Sale_Does_Not_Exist()
    {
        await Should.ThrowAsync<NotFoundException>(
            () => _sut.Handle(new SendIrdInvoiceCommand(Guid.CreateVersion7()), CancellationToken.None).AsTask());
    }

    [Fact]
    public async Task Handle_Should_Assign_InvoiceNumber_And_Enqueue_Item_For_New_Sale()
    {
        // Arrange
        var sale = Sale.StartBuilding(Guid.CreateVersion7(), null, null, null);
        sale.AddItem(Guid.CreateVersion7(), 2m, 10m, 0m, 0m, 5m);
        sale.Finalize("Cash", sale.TotalAmount);
        _db.Sales.Add(sale);
        await _db.SaveChangesAsync(CancellationToken.None);

        // Act
        var result = await _sut.Handle(new SendIrdInvoiceCommand(sale.Id), CancellationToken.None);

        // Assert: a sale with no number gets the next one in its fiscal year's sequence for its branch.
        int fiscalYear = NepalFiscalYear.StartYearFor(sale.SaleDateUtc);
        result.SaleId.ShouldBe(sale.Id);
        result.InvoiceNumber.ShouldBe($"INV-MAIN-{NepalFiscalYear.Label(fiscalYear)}-00007");
        await _invoiceNumbers.Received(1).ReserveNextAsync(sale.BranchId, fiscalYear, Arg.Any<CancellationToken>());

        var reloaded = await _db.Sales.FindAsync(sale.Id);
        reloaded!.InvoiceNumber.ShouldBe(result.InvoiceNumber);

        var queueItem = _db.IrdInvoiceQueues.Single(q => q.SaleId == sale.Id);
        queueItem.Status.ShouldBe(IrdQueueStatus.Pending);
        queueItem.PayloadJson.ShouldContain(result.InvoiceNumber);
    }

    [Fact]
    public async Task Handle_Should_Reuse_Existing_InvoiceNumber_When_Already_Assigned()
    {
        // Arrange
        var sale = Sale.StartBuilding(Guid.CreateVersion7(), null, null, null);
        sale.AddItem(Guid.CreateVersion7(), 1m, 5m, 0m, 0m, 2m);
        sale.Finalize("Cash", sale.TotalAmount);
        sale.AssignInvoiceNumberIfMissing("INV-FIXED-0001");
        _db.Sales.Add(sale);
        await _db.SaveChangesAsync(CancellationToken.None);

        // Act
        var result = await _sut.Handle(new SendIrdInvoiceCommand(sale.Id), CancellationToken.None);

        // Assert
        result.InvoiceNumber.ShouldBe("INV-FIXED-0001");
        await _invoiceNumbers.DidNotReceive().ReserveNextAsync(Arg.Any<Guid>(), Arg.Any<int>(), Arg.Any<CancellationToken>());
    }

    private async Task<Sale> SeedCompletedSaleAsync()
    {
        var sale = Sale.StartBuilding(Guid.CreateVersion7(), null, null, null);
        sale.AddItem(Guid.CreateVersion7(), 1m, 5m, 0m, 0m, 2m);
        sale.Finalize("Cash", sale.TotalAmount);
        _db.Sales.Add(sale);
        await _db.SaveChangesAsync(CancellationToken.None);
        return sale;
    }

    [Fact]
    public async Task Handle_Should_Refuse_A_Second_Enqueue_While_One_Is_Pending()
    {
        var sale = await SeedCompletedSaleAsync();
        await _sut.Handle(new SendIrdInvoiceCommand(sale.Id), CancellationToken.None);

        var ex = await Should.ThrowAsync<CustomException>(() => _sut.Handle(new SendIrdInvoiceCommand(sale.Id), CancellationToken.None).AsTask());

        ex.StatusCode.ShouldBe(System.Net.HttpStatusCode.Conflict);
        _db.IrdInvoiceQueues.Count(q => q.SaleId == sale.Id).ShouldBe(1);
    }

    [Fact]
    public async Task Handle_Should_Allow_A_Resend_After_The_Previous_Item_Failed_For_Good()
    {
        // Mirrors upstream: a re-send after a failure enqueues another queue row, keeping the number.
        var sale = await SeedCompletedSaleAsync();
        await _sut.Handle(new SendIrdInvoiceCommand(sale.Id), CancellationToken.None);
        var first = _db.IrdInvoiceQueues.Single(q => q.SaleId == sale.Id);
        first.BeginAttempt();
        first.MarkFailed("IRD down", isFinal: true, nextAttemptAtUtc: null);
        await _db.SaveChangesAsync(CancellationToken.None);

        await _sut.Handle(new SendIrdInvoiceCommand(sale.Id), CancellationToken.None);

        _db.IrdInvoiceQueues.Count(q => q.SaleId == sale.Id).ShouldBe(2);
        await _invoiceNumbers.Received(1).ReserveNextAsync(Arg.Any<Guid>(), Arg.Any<int>(), Arg.Any<CancellationToken>());
    }

    [Fact]
    public async Task Handle_Should_Refuse_A_Cancelled_Sale()
    {
        var sale = await SeedCompletedSaleAsync();
        sale.Cancel("customer changed mind");
        await _db.SaveChangesAsync(CancellationToken.None);

        var ex = await Should.ThrowAsync<CustomException>(() => _sut.Handle(new SendIrdInvoiceCommand(sale.Id), CancellationToken.None).AsTask());

        ex.StatusCode.ShouldBe(System.Net.HttpStatusCode.Conflict);
        _db.IrdInvoiceQueues.ShouldBeEmpty();
    }

    [Fact]
    public async Task Handle_Should_Refuse_An_Already_Synced_Sale()
    {
        var sale = await SeedCompletedSaleAsync();
        sale.AssignInvoiceNumberIfMissing("INV-1");
        sale.MarkIrdSynced("EXT-1");
        await _db.SaveChangesAsync(CancellationToken.None);

        var ex = await Should.ThrowAsync<CustomException>(() => _sut.Handle(new SendIrdInvoiceCommand(sale.Id), CancellationToken.None).AsTask());

        ex.StatusCode.ShouldBe(System.Net.HttpStatusCode.Conflict);
    }

    public void Dispose() => _db.Dispose();
}

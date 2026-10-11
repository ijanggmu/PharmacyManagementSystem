using FSH.Modules.Inventory.Contracts.Services;
using FSH.Modules.Inventory.Data;
using FSH.Modules.Inventory.Domain;
using FSH.Modules.Inventory.IntegrationEventHandlers;
using FSH.Modules.Inventory.Services;
using FSH.Modules.Multitenancy.Contracts;
using FSH.Modules.Sales.Contracts.Events;
using NSubstitute;

namespace Inventory.Tests.Features;

/// <summary>
/// Cancelled/returned sales put stock back into the lots the sale drew from, at the sale's branch —
/// the outbox dispatcher that runs the restock has no current branch of its own.
/// </summary>
public sealed class RestockTests : IDisposable
{
    private readonly InventoryDbContext _db = InventoryDbContextFactory.Create();
    private readonly Guid _saleBranch = Guid.CreateVersion7();
    private readonly Guid _medicineId = Guid.CreateVersion7();
    private readonly DateOnly _today = NepalClock.Today();

    /// <summary>The branch the cashier sold at.</summary>
    private StockDeductionService SaleSut()
    {
        var currentBranch = Substitute.For<ICurrentBranch>();
        currentBranch.RequireBranchIdAsync(Arg.Any<CancellationToken>()).Returns(_saleBranch);
        return new StockDeductionService(_db, currentBranch);
    }

    /// <summary>The outbox dispatcher: asking it for a branch would resolve the tenant's default branch.</summary>
    private StockDeductionService DispatcherSut()
    {
        var currentBranch = Substitute.For<ICurrentBranch>();
        currentBranch.RequireBranchIdAsync(Arg.Any<CancellationToken>())
            .Returns<Guid>(_ => throw new InvalidOperationException("The dispatcher has no current branch."));
        return new StockDeductionService(_db, currentBranch);
    }

    private MedicineBatch AddLot(string batchNo, DateOnly expiry, decimal quantity, decimal cost, decimal selling)
    {
        var batch = MedicineBatch.Create(_medicineId, _saleBranch, batchNo, expiry, quantity, cost, selling, "R1");
        _db.MedicineBatches.Add(batch);
        _db.SaveChanges();
        return batch;
    }

    private async Task<Guid> SellAsync(decimal quantity)
    {
        var saleId = Guid.CreateVersion7();
        await SaleSut().DeductForSaleAsync(
            new StockDeductionRequest("Sale", saleId, [new StockDeductionLine(_medicineId, quantity)]));
        return saleId;
    }

    private static SaleCancelledIntegrationEvent Cancelled(Guid saleId, Guid? branchId, params SaleCancelledLine[] lines) =>
        new(Guid.NewGuid(), DateTime.UtcNow, "t1", "c", "Sales", saleId, "customer changed mind", lines, branchId);

    [Fact]
    public async Task SaleCancelled_Should_Restore_Quantity_Into_Original_Lots_At_Sale_Branch()
    {
        var lot1 = AddLot("L1", _today.AddMonths(2), 5m, 4m, 9m);
        var lot2 = AddLot("L2", _today.AddMonths(8), 10m, 6m, 12m);
        var saleId = await SellAsync(8m);  // 5 from L1, 3 from L2

        await new SaleCancelledIntegrationEventHandler(DispatcherSut())
            .HandleAsync(Cancelled(saleId, _saleBranch, new SaleCancelledLine(_medicineId, 8m, 4.75m)));

        _db.MedicineBatches.Count().ShouldBe(2);
        _db.MedicineBatches.Single(b => b.Id == lot1.Id).QuantityOnHand.ShouldBe(5m);
        _db.MedicineBatches.Single(b => b.Id == lot2.Id).QuantityOnHand.ShouldBe(10m);
        _db.InventoryTransactions.Where(t => t.Type == InventoryTransactionType.SaleReversal)
            .ShouldAllBe(t => t.BranchId == _saleBranch && t.ReferenceId == saleId);
    }

    [Fact]
    public async Task SaleCancelled_Without_BranchId_Should_Use_Branch_Of_Original_Deduction()
    {
        var lot = AddLot("L1", _today.AddMonths(2), 10m, 4m, 9m);
        var saleId = await SellAsync(4m);

        // An event raised before BranchId was added to it.
        await new SaleCancelledIntegrationEventHandler(DispatcherSut())
            .HandleAsync(Cancelled(saleId, branchId: null, new SaleCancelledLine(_medicineId, 4m, 4m)));

        _db.MedicineBatches.Single(b => b.Id == lot.Id).QuantityOnHand.ShouldBe(10m);
    }

    [Fact]
    public async Task Restock_Should_Reopen_Disposed_Lot_With_Original_Expiry_And_Selling_Price_Once_Per_Lot()
    {
        var expiry = _today.AddMonths(4);
        var lot = AddLot("L1", expiry, 10m, 4m, 9.5m);
        var saleId = await SellAsync(6m);

        // The rest of the lot was written off after the sale.
        _db.MedicineBatches.Single(b => b.Id == lot.Id).WriteOff();
        await _db.SaveChangesAsync();

        // Two lines of the same medicine (the same lot) must not open two live rows with one batch number.
        await new SaleCancelledIntegrationEventHandler(DispatcherSut())
            .HandleAsync(Cancelled(saleId, _saleBranch,
                new SaleCancelledLine(_medicineId, 2m, 4m),
                new SaleCancelledLine(_medicineId, 4m, 4m)));

        var reopened = _db.MedicineBatches.Single(b => !b.IsDisposed);
        reopened.Id.ShouldNotBe(lot.Id);
        reopened.BatchNo.ShouldBe("L1");
        reopened.ExpiryDate.ShouldBe(expiry);
        reopened.SellingPrice.ShouldBe(9.5m);
        reopened.CostPrice.ShouldBe(4m);
        reopened.QuantityOnHand.ShouldBe(6m);
        reopened.BranchId.ShouldBe(_saleBranch);
    }

    [Fact]
    public async Task Restock_Should_Be_Idempotent_For_The_Same_Reference()
    {
        var lot = AddLot("L1", _today.AddMonths(2), 10m, 4m, 9m);
        var saleId = await SellAsync(4m);
        var handler = new SaleCancelledIntegrationEventHandler(DispatcherSut());
        var @event = Cancelled(saleId, _saleBranch, new SaleCancelledLine(_medicineId, 4m, 4m));

        await handler.HandleAsync(@event);
        await handler.HandleAsync(@event);

        _db.MedicineBatches.Single(b => b.Id == lot.Id).QuantityOnHand.ShouldBe(10m);
    }

    [Fact]
    public async Task ReturnCompleted_Should_Restock_At_Return_Branch_Into_Original_Lot()
    {
        var lot = AddLot("L1", _today.AddMonths(2), 10m, 4m, 9m);
        var saleId = await SellAsync(5m);

        await new ReturnCompletedIntegrationEventHandler(DispatcherSut()).HandleAsync(new ReturnCompletedIntegrationEvent(
            Guid.NewGuid(), DateTime.UtcNow, "t1", "c", "Sales", Guid.CreateVersion7(), saleId, _saleBranch, 18m,
            [new ReturnCompletedLine(_medicineId, 2m, 4m)]));

        var restocked = _db.MedicineBatches.Single(b => b.Id == lot.Id);
        restocked.QuantityOnHand.ShouldBe(7m);
        _db.InventoryTransactions.Single(t => t.Type == InventoryTransactionType.SaleReversal).ReferenceType.ShouldBe("Return");
    }

    [Fact]
    public async Task Restock_Without_Original_Draws_Should_Add_To_Earliest_Sellable_Lot_Instead_Of_Inventing_Expiry()
    {
        // A legacy sale with no lot-level ledger: nothing to put back into, so the earliest sellable lot takes it.
        AddLot("EXPIRED", _today.AddDays(-3), 1m, 4m, 9m);
        var earliest = AddLot("SOON", _today.AddMonths(1), 1m, 4m, 9m);
        AddLot("LATER", _today.AddMonths(9), 1m, 4m, 9m);

        await DispatcherSut().RestockAsync(new StockRestockRequest(
            "Sale", Guid.CreateVersion7(), "Sale", Guid.CreateVersion7(), _saleBranch,
            [new StockRestockLine(_medicineId, 3m, 4m)]));

        _db.MedicineBatches.Count().ShouldBe(3);
        _db.MedicineBatches.Single(b => b.Id == earliest.Id).QuantityOnHand.ShouldBe(4m);
    }

    [Fact]
    public async Task Restock_With_No_Lot_At_All_Should_Open_One_NoExpiry_Lot_At_Given_Branch()
    {
        var medicine = Medicine.Create("Cetirizine", null, null, reorderLevel: 1, unitPrice: 7m, costPrice: 3m);
        _db.Medicines.Add(medicine);
        await _db.SaveChangesAsync();

        await DispatcherSut().RestockAsync(new StockRestockRequest(
            "Sale", Guid.CreateVersion7(), "Sale", Guid.CreateVersion7(), _saleBranch,
            [new StockRestockLine(medicine.Id, 2m, 3m), new StockRestockLine(medicine.Id, 1m, 3m)]));

        var lot = _db.MedicineBatches.Single();
        lot.BranchId.ShouldBe(_saleBranch);
        lot.ExpiryDate.ShouldBe(MedicineBatch.NoExpiryDate);
        lot.QuantityOnHand.ShouldBe(3m);
        lot.SellingPrice.ShouldBe(7m);
    }

    [Fact]
    public async Task RestockAsync_Should_Throw_When_No_Branch_Can_Be_Resolved()
    {
        await Should.ThrowAsync<InvalidOperationException>(() => DispatcherSut().RestockAsync(new StockRestockRequest(
            "Sale", Guid.CreateVersion7(), "Sale", Guid.CreateVersion7(), BranchId: null,
            [new StockRestockLine(_medicineId, 1m, 1m)])).AsTask());
    }

    public void Dispose() => _db.Dispose();
}

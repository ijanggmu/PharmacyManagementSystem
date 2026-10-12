using FSH.Framework.Core.Context;
using FSH.Framework.Core.Exceptions;
using FSH.Framework.Eventing.Abstractions;
using FSH.Modules.Inventory.Contracts.Events;
using FSH.Modules.Inventory.Contracts.Services;
using FSH.Modules.Inventory.Contracts.v1.Consignment;
using FSH.Modules.Inventory.Data;
using FSH.Modules.Inventory.Domain;
using FSH.Modules.Inventory.Features.v1.Consignment.ReceiveConsignmentStock;
using FSH.Modules.Inventory.Features.v1.Consignment.SettleConsignment;
using FSH.Modules.Inventory.Services;
using FSH.Modules.Multitenancy.Contracts;
using NSubstitute;

namespace Inventory.Tests.Features;

/// <summary>Settlement bills consigned units actually sold, never stock that is merely missing.</summary>
public sealed class ConsignmentSettlementTests : IDisposable
{
    private readonly InventoryDbContext _db = InventoryDbContextFactory.Create();
    private readonly Guid _branchId = Guid.CreateVersion7();
    private readonly Guid _supplierId = Guid.CreateVersion7();
    private readonly Guid _medicineId;
    private readonly ICurrentBranch _currentBranch = Substitute.For<ICurrentBranch>();
    private readonly ICurrentUser _currentUser = Substitute.For<ICurrentUser>();

    public ConsignmentSettlementTests()
    {
        _currentBranch.GetBranchIdAsync(Arg.Any<CancellationToken>()).Returns(_branchId);
        _currentBranch.RequireBranchIdAsync(Arg.Any<CancellationToken>()).Returns(_branchId);
        _currentUser.Name.Returns("tester");

        var medicine = FSH.Modules.Inventory.Domain.Medicine.Create("Consigned", null, null, reorderLevel: 0, unitPrice: 8m, costPrice: 5m);
        _db.Medicines.Add(medicine);
        _db.SaveChanges();
        _medicineId = medicine.Id;
    }

    private async Task<Guid> ReceiveAsync(decimal quantity, string? batchNo = null) =>
        await new ReceiveConsignmentStockCommandHandler(_db, new StockReceiptService(_db, _currentBranch), _currentBranch)
            .Handle(new ReceiveConsignmentStockCommand(
                _supplierId, _medicineId, batchNo, NepalClock.Today().AddYears(1), quantity, 5m, 8m), CancellationToken.None);

    private async Task SellAsync(decimal quantity, Guid saleId) =>
        await new StockDeductionService(_db, _currentBranch).DeductForSaleAsync(
            new StockDeductionRequest("Sale", saleId, [new StockDeductionLine(_medicineId, quantity)]));

    private (SettleConsignmentCommandHandler Handler, List<ConsignmentSettledIntegrationEvent> Events) Settler()
    {
        var outbox = Substitute.For<IOutboxWriter>();
        var events = new List<ConsignmentSettledIntegrationEvent>();
        outbox.AddAsync(Arg.Do<IIntegrationEvent>(e =>
        {
            if (e is ConsignmentSettledIntegrationEvent settled) events.Add(settled);
        }), Arg.Any<CancellationToken>()).Returns(Task.CompletedTask);
        return (new SettleConsignmentCommandHandler(_db, outbox, _currentUser, _currentBranch), events);
    }

    [Fact]
    public async Task Settle_Should_Bill_Sold_Units_Not_Written_Off_Units()
    {
        await ReceiveAsync(100m);
        await SellAsync(30m, Guid.CreateVersion7());

        // 20 more units go missing (count shortfall) — not a sale, not owed to the supplier yet.
        var lot = _db.MedicineBatches.Single();
        lot.SetQuantity(lot.QuantityOnHand - 20m);
        await _db.SaveChangesAsync();

        var (sut, events) = Settler();
        await sut.Handle(new SettleConsignmentCommand(_supplierId), CancellationToken.None);

        events.ShouldHaveSingleItem().TotalAmount.ShouldBe(150m);  // 30 x 5
        _db.ConsignmentPositions.Single().SettledQuantity.ShouldBe(30m);
    }

    [Fact]
    public async Task Settle_Should_Net_Out_Cancelled_Sales_And_Bill_Only_New_Sales_Next_Time()
    {
        await ReceiveAsync(100m);
        var cancelledSale = Guid.CreateVersion7();
        await SellAsync(10m, cancelledSale);
        await SellAsync(15m, Guid.CreateVersion7());
        await new StockDeductionService(_db, _currentBranch).RestockAsync(new StockRestockRequest(
            "Sale", cancelledSale, "Sale", cancelledSale, _branchId, [new StockRestockLine(_medicineId, 10m, 5m)]));

        var (sut, events) = Settler();
        await sut.Handle(new SettleConsignmentCommand(_supplierId), CancellationToken.None);
        events.ShouldHaveSingleItem().TotalAmount.ShouldBe(75m);  // 15 x 5

        await SellAsync(4m, Guid.CreateVersion7());
        var (second, secondEvents) = Settler();
        await second.Handle(new SettleConsignmentCommand(_supplierId), CancellationToken.None);
        secondEvents.ShouldHaveSingleItem().TotalAmount.ShouldBe(20m);  // 4 x 5
    }

    [Fact]
    public async Task Settle_Should_Ignore_Other_Branches_Positions()
    {
        await ReceiveAsync(10m);
        await SellAsync(5m, Guid.CreateVersion7());

        var elsewhere = Substitute.For<ICurrentBranch>();
        elsewhere.GetBranchIdAsync(Arg.Any<CancellationToken>()).Returns(Guid.CreateVersion7());
        var sut = new SettleConsignmentCommandHandler(_db, Substitute.For<IOutboxWriter>(), _currentUser, elsewhere);

        await Should.ThrowAsync<NotFoundException>(() => sut.Handle(new SettleConsignmentCommand(_supplierId), CancellationToken.None).AsTask());
        _db.ConsignmentPositions.Single().SettledQuantity.ShouldBe(0m);
    }

    [Fact]
    public async Task Receive_Should_Not_Merge_Consigned_Stock_Into_An_Existing_Lot()
    {
        _db.MedicineBatches.Add(MedicineBatch.Create(_medicineId, _branchId, "OWN-1", NepalClock.Today().AddYears(1), 40m, 5m, 8m, null));
        await _db.SaveChangesAsync();

        var ex = await Should.ThrowAsync<CustomException>(() => ReceiveAsync(10m, "own-1"));

        ex.StatusCode.ShouldBe(System.Net.HttpStatusCode.Conflict);
        _db.MedicineBatches.Single().QuantityOnHand.ShouldBe(40m);
        _db.ConsignmentPositions.ShouldBeEmpty();
    }

    public void Dispose() => _db.Dispose();
}

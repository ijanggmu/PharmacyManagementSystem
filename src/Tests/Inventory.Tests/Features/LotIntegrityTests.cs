using System.Net;
using FluentValidation.TestHelper;
using FSH.Framework.Core.Context;
using FSH.Framework.Core.Exceptions;
using FSH.Framework.Eventing.Abstractions;
using FSH.Modules.Inventory.Contracts.Services;
using FSH.Modules.Inventory.Contracts.v1.Consignment;
using FSH.Modules.Inventory.Contracts.v1.Medicines;
using FSH.Modules.Inventory.Contracts.v1.StockTransfers;
using FSH.Modules.Inventory.Data;
using FSH.Modules.Inventory.Domain;
using FSH.Modules.Inventory.Features.v1.Consignment.ReceiveConsignmentStock;
using FSH.Modules.Inventory.Features.v1.Medicines.BulkCreateMedicines;
using FSH.Modules.Inventory.Features.v1.Medicines.RecallMedicineBatch;
using FSH.Modules.Inventory.Features.v1.StockTransfers.CreateStockTransfer;
using FSH.Modules.Inventory.Features.v1.StockTransfers.ReceiveStockTransfer;
using FSH.Modules.Inventory.IntegrationEventHandlers;
using FSH.Modules.Inventory.Services;
using FSH.Modules.Multitenancy.Contracts;
using FSH.Modules.Sales.Contracts.Events;
using NSubstitute;

namespace Inventory.Tests.Features;

/// <summary>
/// Stock that comes back into a lot — a transfer arriving, a return or cancelled sale, a receipt of a known
/// batch — must keep the batch's recall, sell at the medicine's current price, land in the right lot, and
/// never merge owned stock into a consigned lot.
/// </summary>
public sealed class LotIntegrityTests : IDisposable
{
    private readonly InventoryDbContext _db = InventoryDbContextFactory.Create();
    private readonly ICurrentUser _currentUser = Substitute.For<ICurrentUser>();
    private readonly Guid _from = Guid.CreateVersion7();
    private readonly Guid _to = Guid.CreateVersion7();
    private readonly DateOnly _today = NepalClock.Today();
    private readonly Medicine _medicine;

    public LotIntegrityTests()
    {
        _currentUser.GetUserId().Returns(Guid.CreateVersion7());
        _medicine = Medicine.Create("Cetamol", null, null, reorderLevel: 0, unitPrice: 8m, costPrice: 4m);
        _db.Medicines.Add(_medicine);
        _db.SaveChanges();
    }

    private static ICurrentBranch At(Guid branchId)
    {
        var currentBranch = Substitute.For<ICurrentBranch>();
        currentBranch.GetBranchIdAsync(Arg.Any<CancellationToken>()).Returns(branchId);
        currentBranch.RequireBranchIdAsync(Arg.Any<CancellationToken>()).Returns(branchId);
        currentBranch.CanViewAllBranchesAsync(Arg.Any<CancellationToken>()).Returns(false);
        return currentBranch;
    }

    private MedicineBatch AddLot(Guid branchId, string batchNo, decimal quantity, decimal sellingPrice = 8m, int expiryMonths = 6)
    {
        var lot = MedicineBatch.Create(_medicine.Id, branchId, batchNo, _today.AddMonths(expiryMonths), quantity, 4m, sellingPrice, null);
        _db.MedicineBatches.Add(lot);
        _db.SaveChanges();
        return lot;
    }

    private MedicineBatch Lot(Guid id) => _db.MedicineBatches.Single(b => b.Id == id);

    private async Task<Guid> DispatchAsync(decimal quantity)
    {
        var from = At(_from);
        var branchService = Substitute.For<IBranchService>();
        branchService.IsActiveBranchOfCurrentTenantAsync(Arg.Any<Guid>(), Arg.Any<CancellationToken>()).Returns(true);
        return await new CreateStockTransferCommandHandler(_db, _currentUser, from, branchService, new StockDeductionService(_db, from))
            .Handle(new CreateStockTransferCommand(_from, _to, null, [new StockTransferLineInput(_medicine.Id, quantity)]), CancellationToken.None);
    }

    private Task<Guid> ReceiveAsync(Guid transferId) =>
        new ReceiveStockTransferCommandHandler(_db, _currentUser, At(_to), Substitute.For<IOutboxWriter>())
            .Handle(new ReceiveStockTransferCommand(transferId), CancellationToken.None).AsTask();

    private Task<RecallMedicineBatchResult> RecallAsync(string batchNo, string reason = "NSAID contamination") =>
        new RecallMedicineBatchCommandHandler(_db, TimeProvider.System)
            .Handle(new RecallMedicineBatchCommand(_medicine.Id, batchNo, reason), CancellationToken.None).AsTask();

    private async Task<Guid> SellAsync(Guid branchId, decimal quantity)
    {
        var saleId = Guid.CreateVersion7();
        await new StockDeductionService(_db, At(branchId)).DeductForSaleAsync(
            new StockDeductionRequest("Sale", saleId, [new StockDeductionLine(_medicine.Id, quantity)]));
        return saleId;
    }

    private Task ReturnAsync(Guid saleId, Guid branchId, decimal quantity) =>
        new ReturnCompletedIntegrationEventHandler(new StockDeductionService(_db, At(branchId))).HandleAsync(
            new ReturnCompletedIntegrationEvent(
                Guid.NewGuid(), DateTime.UtcNow, "t1", "c", "Sales", Guid.CreateVersion7(), saleId, branchId, 0m,
                [new ReturnCompletedLine(_medicine.Id, quantity, 4m)]));

    private void ChangeMedicinePriceOnly(decimal unitPrice)
    {
        _db.Medicines.Single(m => m.Id == _medicine.Id).ChangePrices(unitPrice, null);
        _db.SaveChanges();
    }

    // --- recall ----------------------------------------------------------------------------------------

    [Fact]
    public async Task Transfer_Recalled_While_In_Transit_Should_Arrive_Recalled()
    {
        AddLot(_from, "T-1", 20m);
        var transferId = await DispatchAsync(20m);   // the source lot is now empty, the stock is on the road
        await RecallAsync("T-1");

        await ReceiveAsync(transferId);

        var arrived = _db.MedicineBatches.Single(b => b.BranchId == _to);
        arrived.QuantityOnHand.ShouldBe(20m);
        arrived.IsRecalled.ShouldBeTrue();
        arrived.RecallReason.ShouldBe("NSAID contamination");
        _db.InventoryTransactions.Count(t => t.Type == InventoryTransactionType.Recall && t.MedicineBatchId == arrived.Id)
            .ShouldBe(1);
    }

    [Fact]
    public async Task Return_Into_Reopened_Lot_Of_Recalled_Batch_Should_Stay_Recalled()
    {
        var lot = AddLot(_from, "R-1", 10m);
        var saleId = await SellAsync(_from, 6m);
        await RecallAsync("R-1");
        Lot(lot.Id).WriteOff();                      // the recalled remainder is destroyed
        await _db.SaveChangesAsync();

        await ReturnAsync(saleId, _from, 6m);

        var reopened = _db.MedicineBatches.Single(b => !b.IsDisposed);
        reopened.Id.ShouldNotBe(lot.Id);
        reopened.QuantityOnHand.ShouldBe(6m);
        reopened.IsRecalled.ShouldBeTrue();
    }

    [Fact]
    public async Task Receipt_Of_A_Recalled_Batch_Number_Should_Open_A_Recalled_Lot()
    {
        AddLot(_from, "X-9", 5m);
        await RecallAsync("X-9");

        var results = await new StockReceiptService(_db, At(_to)).ReceiveAsync(new StockReceiptRequest(
            "GoodsReceipt", Guid.CreateVersion7(), [new StockReceiptLine(_medicine.Id, "x-9", null, 3m, 4m, 8m)]));

        Lot(results[0].BatchId).IsRecalled.ShouldBeTrue();
    }

    // --- batch-number casing ---------------------------------------------------------------------------

    [Fact]
    public async Task Transfer_Receive_Should_Top_Up_Live_Lot_Whose_Batch_No_Differs_Only_In_Case()
    {
        AddLot(_from, "PCM 2401", 10m);
        var legacy = AddLot(_to, "PCM 2401", 2m);
        // A lot stored before batch numbers were normalized.
        typeof(MedicineBatch).GetProperty(nameof(MedicineBatch.BatchNo))!.SetValue(legacy, "pcm  2401");
        await _db.SaveChangesAsync();

        await ReceiveAsync(await DispatchAsync(4m));

        var atDestination = _db.MedicineBatches.Where(b => b.BranchId == _to && !b.IsDisposed).ToList();
        atDestination.ShouldHaveSingleItem().Id.ShouldBe(legacy.Id);
        atDestination[0].QuantityOnHand.ShouldBe(6m);
    }

    // --- price -----------------------------------------------------------------------------------------

    [Fact]
    public async Task Transfer_Receive_Should_Price_Lot_At_Current_Medicine_Price_Not_Dispatch_Snapshot()
    {
        AddLot(_from, "T-2", 10m, sellingPrice: 8m);
        var transferId = await DispatchAsync(4m);
        ChangeMedicinePriceOnly(11m);

        await ReceiveAsync(transferId);

        _db.MedicineBatches.Single(b => b.BranchId == _to).SellingPrice.ShouldBe(11m);
    }

    [Fact]
    public async Task Return_Should_Reprice_The_Lot_At_Current_Medicine_Price()
    {
        var lot = AddLot(_from, "P-1", 5m, sellingPrice: 8m);
        var saleId = await SellAsync(_from, 5m);
        ChangeMedicinePriceOnly(12m);

        await ReturnAsync(saleId, _from, 2m);

        Lot(lot.Id).QuantityOnHand.ShouldBe(2m);
        Lot(lot.Id).SellingPrice.ShouldBe(12m);
    }

    [Fact]
    public async Task Receipt_Top_Up_Should_Take_The_Receipt_Price_Or_The_Medicine_Price_When_None()
    {
        var lot = AddLot(_from, "G-1", 5m, sellingPrice: 8m);
        var sut = new StockReceiptService(_db, At(_from));

        await sut.ReceiveAsync(new StockReceiptRequest(
            "GoodsReceipt", Guid.CreateVersion7(), [new StockReceiptLine(_medicine.Id, "G-1", null, 1m, 4m, 10m)]));
        Lot(lot.Id).SellingPrice.ShouldBe(10m);

        ChangeMedicinePriceOnly(9m);
        await sut.ReceiveAsync(new StockReceiptRequest(
            "GoodsReceipt", Guid.CreateVersion7(), [new StockReceiptLine(_medicine.Id, "G-1", null, 1m, 4m, 0m)]));
        Lot(lot.Id).SellingPrice.ShouldBe(9m);
        Lot(lot.Id).QuantityOnHand.ShouldBe(7m);
    }

    // --- partial returns -------------------------------------------------------------------------------

    [Fact]
    public async Task Second_Partial_Return_Should_Fill_The_Lots_The_First_One_Did_Not()
    {
        var first = AddLot(_from, "L1", 5m, expiryMonths: 2);
        var second = AddLot(_from, "L2", 10m, expiryMonths: 8);
        var saleId = await SellAsync(_from, 8m);     // 5 from L1, 3 from L2

        await ReturnAsync(saleId, _from, 5m);         // fills L1's draw
        await ReturnAsync(saleId, _from, 3m);         // must go to L2, not pile into L1 again

        Lot(first.Id).QuantityOnHand.ShouldBe(5m);
        Lot(second.Id).QuantityOnHand.ShouldBe(10m);
        var credits = _db.InventoryTransactions.Where(t => t.Type == InventoryTransactionType.SaleReversal).ToList();
        credits.ShouldAllBe(t => t.OriginalReferenceType == "Sale" && t.OriginalReferenceId == saleId);
    }

    // --- consignment -----------------------------------------------------------------------------------

    [Fact]
    public async Task Owned_Receipt_Into_A_Consigned_Lot_Should_Conflict()
    {
        await new ReceiveConsignmentStockCommandHandler(_db, new StockReceiptService(_db, At(_from)), At(_from))
            .Handle(new ReceiveConsignmentStockCommand(Guid.CreateVersion7(), _medicine.Id, "CON-1", null, 10m, 4m, 8m),
                CancellationToken.None);

        var ex = await Should.ThrowAsync<CustomException>(() => new StockReceiptService(_db, At(_from)).ReceiveAsync(
            new StockReceiptRequest("GoodsReceipt", Guid.CreateVersion7(),
                [new StockReceiptLine(_medicine.Id, "con-1", null, 5m, 4m, 8m)])).AsTask());

        ex.StatusCode.ShouldBe(HttpStatusCode.Conflict);
        _db.MedicineBatches.Single().QuantityOnHand.ShouldBe(10m);
    }

    [Fact]
    public async Task Consignment_Receipt_For_Unknown_Medicine_Should_Be_Not_Found()
    {
        await Should.ThrowAsync<NotFoundException>(() =>
            new ReceiveConsignmentStockCommandHandler(_db, new StockReceiptService(_db, At(_from)), At(_from))
                .Handle(new ReceiveConsignmentStockCommand(Guid.CreateVersion7(), Guid.CreateVersion7(), "C-1", null, 1m, 1m, 1m),
                    CancellationToken.None).AsTask());
        _db.MedicineBatches.ShouldBeEmpty();
    }

    [Fact]
    public void Consignment_Receipt_Batch_No_Longer_Than_The_Column_Should_Be_Invalid()
    {
        var result = new ReceiveConsignmentStockCommandValidator().TestValidate(
            new ReceiveConsignmentStockCommand(Guid.CreateVersion7(), Guid.CreateVersion7(), new string('B', 65), null, 1m, 1m, 1m));

        result.ShouldHaveValidationErrorFor(c => c.BatchNo);
    }

    // --- bulk import -----------------------------------------------------------------------------------

    private BulkCreateMedicinesCommandHandler BulkHandler(Guid branchId) =>
        new(_db, At(branchId), Substitute.For<IOutboxWriter>(), _currentUser);

    [Fact]
    public async Task Bulk_Import_Top_Up_Should_Add_To_The_Committed_Quantity_And_Take_The_Row_Price()
    {
        var lot = AddLot(_from, "B-1", 10m, sellingPrice: 8m);
        // A sale committed after anything could have read the lot: the import must add to 7, not to 10.
        await SellAsync(_from, 3m);

        await BulkHandler(_from).Handle(new BulkCreateMedicinesCommand(
            [new BulkMedicineRow(_medicine.Name, BatchNo: "b-1", Quantity: 5m, CostPrice: 4m, SellingPrice: 12m)]),
            CancellationToken.None);

        Lot(lot.Id).QuantityOnHand.ShouldBe(12m);
        Lot(lot.Id).SellingPrice.ShouldBe(12m);
    }

    [Fact]
    public async Task Bulk_Import_Into_A_Consigned_Lot_Should_Conflict()
    {
        await new ReceiveConsignmentStockCommandHandler(_db, new StockReceiptService(_db, At(_from)), At(_from))
            .Handle(new ReceiveConsignmentStockCommand(Guid.CreateVersion7(), _medicine.Id, "CON-2", null, 10m, 4m, 8m),
                CancellationToken.None);

        var ex = await Should.ThrowAsync<CustomException>(() => BulkHandler(_from).Handle(new BulkCreateMedicinesCommand(
            [new BulkMedicineRow(_medicine.Name, BatchNo: "CON-2", Quantity: 5m, CostPrice: 4m)]),
            CancellationToken.None).AsTask());

        ex.StatusCode.ShouldBe(HttpStatusCode.Conflict);
    }

    public void Dispose() => _db.Dispose();
}

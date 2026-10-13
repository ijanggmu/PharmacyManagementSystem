using FSH.Framework.Core.Context;
using FSH.Framework.Core.Exceptions;
using FSH.Framework.Eventing.Abstractions;
using FSH.Modules.Inventory.Contracts.v1.Medicines;
using FSH.Modules.Inventory.Data;
using FSH.Modules.Inventory.Domain;
using FSH.Modules.Inventory.Features.v1.Medicines.BulkCreateMedicines;
using FSH.Modules.Inventory.Features.v1.Medicines.RecallMedicineBatch;
using FSH.Modules.Inventory.Features.v1.Medicines.UpdateMedicine;
using FSH.Modules.Inventory.Services;
using FSH.Modules.Multitenancy.Contracts;
using NSubstitute;

namespace Inventory.Tests.Features;

/// <summary>
/// Stock entered or corrected by hand never gets a made-up expiry: a counted surplus goes onto the
/// earliest sellable lot, a bulk row without an expiry is stored as "no expiry" (as receipts are), and
/// a recall finds its lot however the batch number was typed.
/// </summary>
public sealed class MedicineStockCorrectionTests : IDisposable
{
    private readonly InventoryDbContext _db = InventoryDbContextFactory.Create();
    private readonly Guid _branchId = Guid.CreateVersion7();
    private readonly ICurrentBranch _currentBranch = Substitute.For<ICurrentBranch>();
    private readonly DateOnly _today = NepalClock.Today();

    public MedicineStockCorrectionTests()
    {
        _currentBranch.RequireBranchIdAsync(Arg.Any<CancellationToken>()).Returns(_branchId);
        _currentBranch.GetBranchIdAsync(Arg.Any<CancellationToken>()).Returns(_branchId);
    }

    private UpdateMedicineCommandHandler UpdateHandler() => new(
        _db, new StockReceiptService(_db, _currentBranch), _currentBranch, Substitute.For<IOutboxWriter>(), Substitute.For<ICurrentUser>(), Substitute.For<FSH.Modules.Identity.Contracts.Services.IApprovalService>());

    private async Task<Medicine> SeedMedicineAsync(params (string BatchNo, int ExpiryInDays, decimal Quantity)[] lots)
    {
        var medicine = Medicine.Create("Omeprazole", null, null, reorderLevel: 5, unitPrice: 10m, costPrice: 4m);
        _db.Medicines.Add(medicine);
        foreach (var (batchNo, expiryInDays, quantity) in lots)
        {
            _db.MedicineBatches.Add(MedicineBatch.Create(medicine.Id, _branchId, batchNo, _today.AddDays(expiryInDays), quantity, 4m, 10m, null));
        }

        await _db.SaveChangesAsync();
        return medicine;
    }

    [Fact]
    public async Task Upward_Count_Correction_Should_Add_To_Earliest_Sellable_Lot_Without_New_Lot()
    {
        var medicine = await SeedMedicineAsync(("EXPIRED", -10, 2m), ("SOON", 30, 3m), ("LATER", 300, 5m));

        await UpdateHandler().Handle(
            new UpdateMedicineCommand(medicine.Id, medicine.Name, StockAdjustmentTargetQuantity: 15m, StockAdjustmentReason: "count"),
            CancellationToken.None);

        _db.MedicineBatches.Count().ShouldBe(3);
        _db.MedicineBatches.Single(b => b.BatchNo == "SOON").QuantityOnHand.ShouldBe(8m);
        _db.MedicineBatches.ShouldNotContain(b => b.ExpiryDate == MedicineBatch.NoExpiryDate);
    }

    [Fact]
    public async Task Upward_Count_Correction_Without_Sellable_Lot_Or_Expiry_Should_Be_Rejected()
    {
        var medicine = await SeedMedicineAsync(("EXPIRED", -10, 2m));

        var ex = await Should.ThrowAsync<CustomException>(() => UpdateHandler().Handle(
            new UpdateMedicineCommand(medicine.Id, medicine.Name, StockAdjustmentTargetQuantity: 10m, StockAdjustmentReason: "count"),
            CancellationToken.None).AsTask());

        ex.StatusCode.ShouldBe(System.Net.HttpStatusCode.BadRequest);
        _db.MedicineBatches.Single().QuantityOnHand.ShouldBe(2m);
    }

    [Fact]
    public async Task Upward_Count_Correction_With_Expiry_Should_Open_That_Lot()
    {
        var medicine = await SeedMedicineAsync();
        var expiry = _today.AddMonths(10);

        await UpdateHandler().Handle(
            new UpdateMedicineCommand(medicine.Id, medicine.Name, ExpiryDate: expiry, BatchNumber: "found-1",
                StockAdjustmentTargetQuantity: 6m, StockAdjustmentReason: "found in store room"),
            CancellationToken.None);

        var lot = _db.MedicineBatches.Single();
        lot.BatchNo.ShouldBe("FOUND-1");
        lot.ExpiryDate.ShouldBe(expiry);
        lot.QuantityOnHand.ShouldBe(6m);
        lot.InitialQuantity.ShouldBe(6m);
    }

    [Fact]
    public async Task Downward_Count_Correction_Should_Consume_Fefo()
    {
        var medicine = await SeedMedicineAsync(("SOON", 30, 3m), ("LATER", 300, 5m));

        await UpdateHandler().Handle(
            new UpdateMedicineCommand(medicine.Id, medicine.Name, StockAdjustmentTargetQuantity: 4m, StockAdjustmentReason: "count"),
            CancellationToken.None);

        _db.MedicineBatches.Single(b => b.BatchNo == "SOON").QuantityOnHand.ShouldBe(0m);
        _db.MedicineBatches.Single(b => b.BatchNo == "LATER").QuantityOnHand.ShouldBe(4m);
    }

    [Fact]
    public async Task BulkCreate_Row_Without_Expiry_Should_Store_NoExpiry_Not_A_Made_Up_Date()
    {
        var handler = new BulkCreateMedicinesCommandHandler(_db, _currentBranch, Substitute.For<IOutboxWriter>(), Substitute.For<ICurrentUser>());

        await handler.Handle(new BulkCreateMedicinesCommand([new BulkMedicineRow("Zinc", Quantity: 10m, CostPrice: 1m)]), CancellationToken.None);

        _db.MedicineBatches.Single().ExpiryDate.ShouldBe(MedicineBatch.NoExpiryDate);
    }

    [Fact]
    public async Task Recall_Should_Match_Batch_Number_Regardless_Of_Case_And_Spacing()
    {
        var medicine = await SeedMedicineAsync(("PCM 2401", 100, 5m));

        var result = await new RecallMedicineBatchCommandHandler(_db, TimeProvider.System)
            .Handle(new RecallMedicineBatchCommand(medicine.Id, "  pcm   2401 ", "supplier notice"), CancellationToken.None);

        result.Affected.ShouldBe(1);
        _db.MedicineBatches.Single().IsRecalled.ShouldBeTrue();
    }

    [Theory]
    [InlineData("2026-10-10T18:14:00Z", "2026-10-10")]
    [InlineData("2026-10-10T18:15:00Z", "2026-10-11")]
    [InlineData("2026-10-11T00:00:00Z", "2026-10-11")]
    public void NepalClock_Should_Roll_Date_At_Nepal_Midnight(string utc, string expected)
    {
        var instant = DateTimeOffset.Parse(utc, System.Globalization.CultureInfo.InvariantCulture);

        NepalClock.DateOf(instant).ShouldBe(DateOnly.Parse(expected, System.Globalization.CultureInfo.InvariantCulture));
    }

    public void Dispose() => _db.Dispose();
}

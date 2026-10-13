using FSH.Framework.Core.Exceptions;
using FSH.Modules.Inventory.Contracts.Services;
using FSH.Modules.Inventory.Data;
using FSH.Modules.Inventory.Domain;
using FSH.Modules.Inventory.Services;
using FSH.Modules.Multitenancy.Contracts;
using Microsoft.EntityFrameworkCore;
using NSubstitute;

namespace Inventory.Tests.Features;

/// <summary>A supplier return can name the lot going back; without one, oldest-expiring first.</summary>
public sealed class PinnedBatchDeductionTests : IDisposable
{
    private readonly InventoryDbContext _db = InventoryDbContextFactory.Create();
    private readonly Guid _branchId = Guid.CreateVersion7();

    private StockDeductionService CreateSut()
    {
        var branch = Substitute.For<ICurrentBranch>();
        branch.RequireBranchIdAsync(Arg.Any<CancellationToken>()).Returns(_branchId);
        return new StockDeductionService(_db, branch);
    }

    private async Task<(Guid MedicineId, MedicineBatch Early, MedicineBatch Late)> SeedAsync()
    {
        var medicineId = Guid.CreateVersion7();
        var early = MedicineBatch.Create(medicineId, _branchId, "EARLY", DateOnly.FromDateTime(DateTime.UtcNow.AddMonths(2)), 10m, 5m, 8m, null);
        var late = MedicineBatch.Create(medicineId, _branchId, "LATE", DateOnly.FromDateTime(DateTime.UtcNow.AddYears(2)), 10m, 6m, 8m, null);
        _db.MedicineBatches.AddRange(early, late);
        await _db.SaveChangesAsync();
        return (medicineId, early, late);
    }

    [Fact]
    public async Task A_Pinned_Line_Should_Come_Out_Of_That_Batch_Only()
    {
        var (medicineId, early, late) = await SeedAsync();

        var result = await CreateSut().DeductForSupplierReturnAsync(new StockDeductionRequest(
            "SupplierReturn", Guid.CreateVersion7(), [new StockDeductionLine(medicineId, 4m, late.Id)]));

        result.Single().Batches.ShouldHaveSingleItem().BatchNo.ShouldBe("LATE");
        (await OnHandAsync(late.Id)).ShouldBe(6m);
        (await OnHandAsync(early.Id)).ShouldBe(10m);
    }

    [Fact]
    public async Task A_Pinned_Line_Beyond_The_Batch_Should_Be_Refused_Even_With_Stock_Elsewhere()
    {
        var (medicineId, early, late) = await SeedAsync();

        await Should.ThrowAsync<InsufficientStockException>(() => CreateSut().DeductForSupplierReturnAsync(new StockDeductionRequest(
            "SupplierReturn", Guid.CreateVersion7(), [new StockDeductionLine(medicineId, 12m, late.Id)])).AsTask());

        (await OnHandAsync(late.Id)).ShouldBe(10m);
        (await OnHandAsync(early.Id)).ShouldBe(10m);
    }

    [Fact]
    public async Task An_Unpinned_Line_Should_Take_The_Oldest_Expiry_First()
    {
        var (medicineId, early, _) = await SeedAsync();

        var result = await CreateSut().DeductForSupplierReturnAsync(new StockDeductionRequest(
            "SupplierReturn", Guid.CreateVersion7(), [new StockDeductionLine(medicineId, 3m)]));

        result.Single().Batches.ShouldHaveSingleItem().BatchNo.ShouldBe("EARLY");
        (await OnHandAsync(early.Id)).ShouldBe(7m);
    }

    private async Task ConsignAsync(MedicineBatch lot)
    {
        _db.ConsignmentPositions.Add(ConsignmentPosition.Create(
            Guid.CreateVersion7(), lot.MedicineId, lot.Id, lot.BatchNo, lot.QuantityOnHand, lot.CostPrice, DateTime.UtcNow, _branchId));
        await _db.SaveChangesAsync();
    }

    [Fact]
    public async Task An_Unpinned_Return_Should_Skip_A_Consigned_Lot_Even_When_It_Expires_First()
    {
        var (medicineId, early, late) = await SeedAsync();
        await ConsignAsync(early);

        var result = await CreateSut().DeductForSupplierReturnAsync(new StockDeductionRequest(
            "SupplierReturn", Guid.CreateVersion7(), [new StockDeductionLine(medicineId, 3m)]));

        result.Single().Batches.ShouldHaveSingleItem().BatchNo.ShouldBe("LATE");
        (await OnHandAsync(early.Id)).ShouldBe(10m);
        (await OnHandAsync(late.Id)).ShouldBe(7m);
    }

    [Fact]
    public async Task A_Return_Should_Not_Count_Consigned_Stock_As_Available()
    {
        var (medicineId, early, late) = await SeedAsync();
        await ConsignAsync(early);

        await Should.ThrowAsync<InsufficientStockException>(() => CreateSut().DeductForSupplierReturnAsync(new StockDeductionRequest(
            "SupplierReturn", Guid.CreateVersion7(), [new StockDeductionLine(medicineId, 15m)])).AsTask());

        (await OnHandAsync(early.Id)).ShouldBe(10m);
        (await OnHandAsync(late.Id)).ShouldBe(10m);
    }

    [Fact]
    public async Task A_Return_Pinned_To_A_Consigned_Lot_Should_Be_Refused()
    {
        var (medicineId, early, _) = await SeedAsync();
        await ConsignAsync(early);

        var ex = await Should.ThrowAsync<CustomException>(() => CreateSut().DeductForSupplierReturnAsync(new StockDeductionRequest(
            "SupplierReturn", Guid.CreateVersion7(), [new StockDeductionLine(medicineId, 2m, early.Id)])).AsTask());

        ex.StatusCode.ShouldBe(System.Net.HttpStatusCode.Conflict);
        ex.Message.ShouldContain("consignment stock");
        (await OnHandAsync(early.Id)).ShouldBe(10m);
        _db.InventoryTransactions.ShouldBeEmpty();
    }

    [Fact]
    public async Task A_Sale_Should_Still_Draw_From_A_Consigned_Lot()
    {
        var (medicineId, early, _) = await SeedAsync();
        await ConsignAsync(early);

        var result = await CreateSut().DeductForSaleAsync(new StockDeductionRequest(
            "Sale", Guid.CreateVersion7(), [new StockDeductionLine(medicineId, 3m)]));

        result.Single().Batches.ShouldHaveSingleItem().BatchNo.ShouldBe("EARLY");
    }

    private async Task<decimal> OnHandAsync(Guid batchId) =>
        (await _db.MedicineBatches.AsNoTracking().SingleAsync(b => b.Id == batchId)).QuantityOnHand;

    public void Dispose() => _db.Dispose();
}

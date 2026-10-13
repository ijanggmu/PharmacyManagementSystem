using System.Net;
using FSH.Framework.Core.Context;
using FSH.Framework.Core.Exceptions;
using FSH.Framework.Eventing.Abstractions;
using FSH.Modules.Inventory.Contracts.Services;
using FSH.Modules.Inventory.Contracts.v1.Batches;
using FSH.Modules.Inventory.Contracts.v1.Medicines;
using FSH.Modules.Inventory.Data;
using FSH.Modules.Inventory.Domain;
using FSH.Modules.Inventory.Features.v1.Batches.CreateBatch;
using FSH.Modules.Inventory.Features.v1.Medicines.AddMedicineStock;
using FSH.Modules.Inventory.Features.v1.Medicines.BulkCreateMedicines;
using FSH.Modules.Inventory.Features.v1.Medicines.CreateMedicine;
using FSH.Modules.Inventory.Features.v1.Medicines.FindDuplicateMedicines;
using FSH.Modules.Inventory.Features.v1.Medicines.GenerateMedicineBarcode;
using FSH.Modules.Inventory.Features.v1.Medicines.UpdateMedicine;
using FSH.Modules.Inventory.Services;
using FSH.Modules.Multitenancy.Contracts;
using NSubstitute;

namespace Inventory.Tests.Features;

/// <summary>
/// One medicine per product (name + strength + form), one live lot per batch number (with one
/// expiry), one medicine per barcode.
/// </summary>
public sealed class MedicineIdentityTests : IDisposable
{
    private static readonly DateOnly Expiry = DateOnly.FromDateTime(DateTime.UtcNow.AddYears(1));

    private readonly InventoryDbContext _db = InventoryDbContextFactory.Create();
    private readonly Guid _branchId = Guid.CreateVersion7();
    private readonly ICurrentBranch _currentBranch = Substitute.For<ICurrentBranch>();

    public MedicineIdentityTests()
    {
        _currentBranch.RequireBranchIdAsync(Arg.Any<CancellationToken>()).Returns(_branchId);
        _currentBranch.GetBranchIdAsync(Arg.Any<CancellationToken>()).Returns(_branchId);
    }

    // ---- duplicates -------------------------------------------------------------------------

    [Fact]
    public async Task FindDuplicates_Should_Match_Name_Strength_Form_Ignoring_Case_And_Spaces()
    {
        var existing = await SeedMedicineAsync("Cetamol", "500 mg", "Tablet");
        await SeedMedicineAsync("Cetamol", "650mg", "Tablet");

        var matches = await new FindDuplicateMedicinesQueryHandler(_db)
            .Handle(new FindDuplicateMedicinesQuery("  cetamol ", "500MG", "tablet"), CancellationToken.None);

        matches.ShouldHaveSingleItem().Id.ShouldBe(existing.Id);
    }

    [Fact]
    public async Task FindDuplicates_Should_Report_Live_Stock_And_Honour_ExcludeId()
    {
        var existing = await SeedMedicineAsync("Cetamol", "500mg", "Tablet");
        _db.MedicineBatches.Add(MedicineBatch.Create(existing.Id, _branchId, "B1", Expiry, 40m, 1m, 2m, null));
        await _db.SaveChangesAsync();

        var handler = new FindDuplicateMedicinesQueryHandler(_db);
        (await handler.Handle(new FindDuplicateMedicinesQuery("Cetamol", "500mg", "Tablet"), CancellationToken.None))
            .ShouldHaveSingleItem().StockOnHand.ShouldBe(40m);
        (await handler.Handle(new FindDuplicateMedicinesQuery("Cetamol", "500mg", "Tablet", existing.Id), CancellationToken.None))
            .ShouldBeEmpty();
    }

    [Fact]
    public async Task CreateMedicine_Should_Reject_A_Duplicate_Unless_Allowed()
    {
        await SeedMedicineAsync("Amoxicillin", "500mg", "Capsule");
        var sut = CreateMedicineHandler();

        var ex = await Should.ThrowAsync<CustomException>(() =>
            sut.Handle(new CreateMedicineCommand("amoxicillin", Strength: "500 mg", Form: "capsule"), CancellationToken.None).AsTask());
        ex.StatusCode.ShouldBe(HttpStatusCode.Conflict);

        await sut.Handle(new CreateMedicineCommand("Amoxicillin", Strength: "500mg", Form: "Capsule", AllowDuplicate: true), CancellationToken.None);
        _db.Medicines.Count(m => m.Name == "Amoxicillin").ShouldBe(2);
    }

    [Fact]
    public async Task AddMedicineStock_Should_Add_A_New_Batch_To_The_Existing_Medicine()
    {
        var medicine = await SeedMedicineAsync("Cetamol", "500mg", "Tablet");
        _db.MedicineBatches.Add(MedicineBatch.Create(medicine.Id, _branchId, "OLD1", Expiry, 10m, 1m, 2m, null));
        await _db.SaveChangesAsync();

        var batchId = await AddStockHandler().Handle(
            new AddMedicineStockCommand(medicine.Id, 25m, "new1", Expiry.AddMonths(6), CostPrice: 1m, SellingPrice: 2m),
            CancellationToken.None);

        var batch = _db.MedicineBatches.Single(b => b.Id == batchId);
        batch.MedicineId.ShouldBe(medicine.Id);
        batch.BatchNo.ShouldBe("NEW1");
        batch.QuantityOnHand.ShouldBe(25m);
        _db.MedicineBatches.Count(b => b.MedicineId == medicine.Id).ShouldBe(2);
        _db.Medicines.Count().ShouldBe(1);
    }

    [Fact]
    public async Task BulkCreate_Should_Add_Stock_To_Existing_And_Earlier_Rows_Instead_Of_Duplicating()
    {
        var existing = await SeedMedicineAsync("Cetamol", "500mg", "Tablet");
        var sut = new BulkCreateMedicinesCommandHandler(
            _db, _currentBranch, Substitute.For<IOutboxWriter>(), Substitute.For<ICurrentUser>());

        var result = await sut.Handle(new BulkCreateMedicinesCommand([
            new BulkMedicineRow("cetamol", Strength: "500 mg", Form: "tablet", BatchNo: "A1", ExpiryDate: Expiry, Quantity: 10m, CostPrice: 1m),
            new BulkMedicineRow("Brufen", Strength: "400mg", Form: "Tablet", BatchNo: "B1", ExpiryDate: Expiry, Quantity: 5m, CostPrice: 2m),
            new BulkMedicineRow("BRUFEN", Strength: "400mg", Form: "Tablet", BatchNo: "b1", ExpiryDate: Expiry, Quantity: 7m, CostPrice: 2m),
        ]), CancellationToken.None);

        result.Created[0].MedicineId.ShouldBe(existing.Id);
        result.Created[0].AddedToExisting.ShouldBeTrue();
        result.Created[1].AddedToExisting.ShouldBeFalse();
        result.Created[2].MedicineId.ShouldBe(result.Created[1].MedicineId);
        result.Created[2].AddedToExisting.ShouldBeTrue();

        _db.Medicines.Count().ShouldBe(2);
        // Same batch number in two rows of one import is one lot holding both quantities.
        var brufenBatch = _db.MedicineBatches.Where(b => b.MedicineId == result.Created[1].MedicineId).ShouldHaveSingleItem();
        brufenBatch.QuantityOnHand.ShouldBe(12m);
    }

    // ---- batch numbers ----------------------------------------------------------------------

    [Fact]
    public async Task StockReceipt_Should_TopUp_A_Batch_Regardless_Of_Case_And_Spacing()
    {
        var medicineId = Guid.CreateVersion7();
        _db.MedicineBatches.Add(MedicineBatch.Create(medicineId, _branchId, "PCM 2401", Expiry, 10m, 1m, 2m, null));
        await _db.SaveChangesAsync();

        await new StockReceiptService(_db, _currentBranch).ReceiveAsync(new StockReceiptRequest(
            "GoodsReceipt", Guid.CreateVersion7(), [new StockReceiptLine(medicineId, " pcm  2401", Expiry, 5m, 1m, 2m)]));

        _db.MedicineBatches.ShouldHaveSingleItem().QuantityOnHand.ShouldBe(15m);
    }

    [Fact]
    public async Task StockReceipt_Should_Reject_A_Known_BatchNo_With_A_Different_Expiry()
    {
        var medicineId = Guid.CreateVersion7();
        _db.MedicineBatches.Add(MedicineBatch.Create(medicineId, _branchId, "PCM2401", Expiry, 10m, 1m, 2m, null));
        await _db.SaveChangesAsync();

        var ex = await Should.ThrowAsync<CustomException>(() => new StockReceiptService(_db, _currentBranch).ReceiveAsync(
            new StockReceiptRequest("GoodsReceipt", Guid.CreateVersion7(),
                [new StockReceiptLine(medicineId, "PCM2401", Expiry.AddMonths(3), 5m, 1m, 2m)])).AsTask());

        ex.StatusCode.ShouldBe(HttpStatusCode.Conflict);
        _db.MedicineBatches.ShouldHaveSingleItem().QuantityOnHand.ShouldBe(10m);
    }

    [Fact]
    public async Task StockReceipt_Without_Expiry_Should_TopUp_The_Known_Batch()
    {
        var medicineId = Guid.CreateVersion7();
        _db.MedicineBatches.Add(MedicineBatch.Create(medicineId, _branchId, "PCM2401", Expiry, 10m, 1m, 2m, null));
        await _db.SaveChangesAsync();

        await new StockReceiptService(_db, _currentBranch).ReceiveAsync(new StockReceiptRequest(
            "GoodsReceipt", Guid.CreateVersion7(), [new StockReceiptLine(medicineId, "PCM2401", null, 5m, 1m, 2m)]));

        _db.MedicineBatches.ShouldHaveSingleItem().QuantityOnHand.ShouldBe(15m);
    }

    [Fact]
    public async Task CreateBatch_Should_Return_Conflict_For_An_Existing_BatchNo()
    {
        var medicine = await SeedMedicineAsync("Cetamol", "500mg", "Tablet");
        _db.MedicineBatches.Add(MedicineBatch.Create(medicine.Id, _branchId, "PCM2401", Expiry, 10m, 1m, 2m, null));
        await _db.SaveChangesAsync();
        var sut = new CreateBatchCommandHandler(_db, _currentBranch, Substitute.For<IOutboxWriter>(), Substitute.For<ICurrentUser>());

        var ex = await Should.ThrowAsync<CustomException>(() =>
            sut.Handle(new CreateBatchCommand(medicine.Id, "pcm2401", Expiry, 5m, 1m, 2m, null), CancellationToken.None).AsTask());

        ex.StatusCode.ShouldBe(HttpStatusCode.Conflict);
    }

    // ---- barcodes ---------------------------------------------------------------------------

    [Fact]
    public async Task CreateMedicine_Should_Reject_A_Barcode_Already_In_Use()
    {
        await SeedMedicineAsync("Cetamol", "500mg", "Tablet", barcode: "8901234567890");

        var ex = await Should.ThrowAsync<CustomException>(() => CreateMedicineHandler().Handle(
            new CreateMedicineCommand("Brufen", Strength: "400mg", Barcode: " 8901234567890 "), CancellationToken.None).AsTask());

        ex.StatusCode.ShouldBe(HttpStatusCode.Conflict);
    }

    [Fact]
    public async Task UpdateMedicine_Should_Allow_Keeping_Its_Own_Barcode_But_Not_Taking_Another()
    {
        var first = await SeedMedicineAsync("Cetamol", "500mg", "Tablet", barcode: "8901234567890");
        var second = await SeedMedicineAsync("Brufen", "400mg", "Tablet", barcode: "8901234567891");
        var sut = new UpdateMedicineCommandHandler(
            _db, new StockReceiptService(_db, _currentBranch), _currentBranch,
            Substitute.For<IOutboxWriter>(), Substitute.For<ICurrentUser>(), Substitute.For<FSH.Modules.Identity.Contracts.Services.IApprovalService>());

        await sut.Handle(new UpdateMedicineCommand(second.Id, "Brufen", Barcode: "8901234567891"), CancellationToken.None);

        var ex = await Should.ThrowAsync<CustomException>(() =>
            sut.Handle(new UpdateMedicineCommand(second.Id, "Brufen", Barcode: first.Barcode), CancellationToken.None).AsTask());
        ex.StatusCode.ShouldBe(HttpStatusCode.Conflict);
    }

    [Fact]
    public async Task GenerateBarcode_Should_Return_An_Unused_InStore_Ean13()
    {
        var generated = await new GenerateMedicineBarcodeQueryHandler(_db)
            .Handle(new GenerateMedicineBarcodeQuery(), CancellationToken.None);

        Ean13.IsValid(generated.Barcode).ShouldBeTrue();
        generated.Barcode[0].ShouldBe('2');
    }

    // ---- helpers ----------------------------------------------------------------------------

    private CreateMedicineCommandHandler CreateMedicineHandler() => new(
        _db, new StockReceiptService(_db, _currentBranch), Substitute.For<IOutboxWriter>(),
        Substitute.For<ICurrentUser>(), _currentBranch);

    private AddMedicineStockCommandHandler AddStockHandler() => new(
        _db, new StockReceiptService(_db, _currentBranch), Substitute.For<IOutboxWriter>(),
        Substitute.For<ICurrentUser>(), _currentBranch);

    private async Task<Medicine> SeedMedicineAsync(string name, string? strength, string? form, string? barcode = null)
    {
        var medicine = Medicine.Create(name, null, null, reorderLevel: 0, isControlled: false,
            strength: strength, form: form, barcode: barcode);
        _db.Medicines.Add(medicine);
        await _db.SaveChangesAsync();
        return medicine;
    }

    public void Dispose() => _db.Dispose();
}

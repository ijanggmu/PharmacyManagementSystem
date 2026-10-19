using FluentValidation.TestHelper;
using FSH.Framework.Core.Context;
using FSH.Framework.Eventing.Abstractions;
using FSH.Modules.Identity.Contracts.Services;
using FSH.Modules.Inventory.Contracts.Events;
using FSH.Modules.Inventory.Contracts.v1.Medicines;
using FSH.Modules.Inventory.Data;
using FSH.Modules.Inventory.Domain;
using FSH.Modules.Inventory.Features.v1.Medicines.ImportOpeningStock;
using FSH.Modules.Inventory.Services;
using FSH.Modules.Multitenancy.Contracts;
using Microsoft.EntityFrameworkCore;
using NSubstitute;

namespace Inventory.Tests.Features;

/// <summary>Opening-stock spreadsheet import: medicine matching (id / barcode / name + strength + form), lot rules,
/// all-or-nothing, and one OpeningStockReceivedIntegrationEvent carrying the file's funding and as-of date.</summary>
public sealed class ImportOpeningStockTests : IDisposable
{
    private readonly InventoryDbContext _db = InventoryDbContextFactory.Create();
    private readonly IOutboxWriter _outbox = Substitute.For<IOutboxWriter>();
    private readonly ICurrentBranch _currentBranch = Substitute.For<ICurrentBranch>();
    private readonly ICurrentUser _currentUser = Substitute.For<ICurrentUser>();
    private readonly IUserPermissionService _permissions = Substitute.For<IUserPermissionService>();
    private readonly List<IIntegrationEvent> _events = [];
    private readonly Guid _branchId = Guid.CreateVersion7();
    private static readonly DateOnly NextYear = DateOnly.FromDateTime(DateTime.UtcNow.AddYears(1));

    public ImportOpeningStockTests()
    {
        _currentBranch.RequireBranchIdAsync(Arg.Any<CancellationToken>()).Returns(_branchId);
        _currentBranch.GetBranchIdAsync(Arg.Any<CancellationToken>()).Returns(_branchId);
        _outbox.AddAsync(Arg.Do<IIntegrationEvent>(_events.Add), Arg.Any<CancellationToken>()).Returns(Task.CompletedTask);
        _currentUser.GetUserId().Returns(Guid.CreateVersion7());
        _permissions.HasPermissionAsync(Arg.Any<string>(), Arg.Any<string>(), Arg.Any<CancellationToken>()).Returns(true);
    }

    public void Dispose() => _db.Dispose();

    private ImportOpeningStockCommandHandler Sut() =>
        new(_db, new StockReceiptService(_db, _currentBranch), _outbox, _currentUser, _currentBranch, _permissions);

    private async Task<Medicine> SeedMedicineAsync(string name, string? strength = null, string? form = null, string? barcode = null)
    {
        var medicine = Medicine.Create(name, null, null, reorderLevel: 0, unitPrice: 12m, form: form, strength: strength, barcode: barcode);
        _db.Medicines.Add(medicine);
        await _db.SaveChangesAsync();
        return medicine;
    }

    [Fact]
    public async Task Rows_Should_Match_Medicines_By_Id_Barcode_Or_Name_Strength_Form_And_Post_One_Opening_Stock_Event()
    {
        var para = await SeedMedicineAsync("Paracetamol", "500 mg", "Tablet");
        var amox = await SeedMedicineAsync("Amoxicillin", "250mg", "Capsule", barcode: "8901234567890");
        var ors = await SeedMedicineAsync("ORS");
        var asOf = DateOnly.FromDateTime(DateTime.UtcNow.AddDays(-3));

        var result = await Sut().Handle(new ImportOpeningStockCommand([
            new OpeningStockImportRow(2, MedicineName: "paracetamol", Strength: "500MG", Form: "tablet", BatchNo: "P-1",
                ExpiryDate: NextYear, Quantity: 100m, CostPrice: 2m, SellingPrice: 3m, RackLocation: "A1"),
            new OpeningStockImportRow(3, Barcode: "8901234567890", BatchNo: "AX-9", ExpiryDate: NextYear, Quantity: 50m, CostPrice: 4m),
            new OpeningStockImportRow(4, MedicineId: ors.Id, Quantity: 10m, CostPrice: 1.5m),
        ], AsOfDate: asOf), CancellationToken.None);

        result.Committed.ShouldBeTrue();
        result.Received.ShouldBe(3);
        result.TotalValue.ShouldBe(415m);
        result.Rows.Select(r => r.MedicineId).ShouldBe([para.Id, amox.Id, ors.Id]);
        result.Rows.ShouldAllBe(r => r.BatchId != null);

        var paraLot = await _db.MedicineBatches.SingleAsync(b => b.MedicineId == para.Id);
        paraLot.BranchId.ShouldBe(_branchId);
        paraLot.QuantityOnHand.ShouldBe(100m);
        paraLot.SellingPrice.ShouldBe(3m);
        paraLot.RackLocation.ShouldBe("A1");
        (await _db.MedicineBatches.SingleAsync(b => b.MedicineId == ors.Id)).ExpiryDate.ShouldBe(MedicineBatch.NoExpiryDate);
        (await _db.InventoryTransactions.CountAsync(t => t.ReferenceType == ImportOpeningStockCommandHandler.ReferenceType)).ShouldBe(3);

        var opening = _events.OfType<OpeningStockReceivedIntegrationEvent>().ShouldHaveSingleItem();
        opening.Amount.ShouldBe(415m);
        opening.Funding.ShouldBe(StockFundingSources.OpeningStock);
        opening.BranchId.ShouldBe(_branchId);
        opening.ReceivedOnUtc.ShouldBe(asOf.ToDateTime(TimeOnly.MinValue, DateTimeKind.Utc));
    }

    [Theory]
    [InlineData(StockFundingSources.Cash)]
    [InlineData(StockFundingSources.Bank)]
    public async Task Paid_Funding_Should_Ride_On_The_Event(string funding)
    {
        await SeedMedicineAsync("ORS");

        var result = await Sut().Handle(
            new ImportOpeningStockCommand([new OpeningStockImportRow(2, MedicineName: "ORS", Quantity: 10m, CostPrice: 5m)], funding),
            CancellationToken.None);

        result.Funding.ShouldBe(funding);
        var opening = _events.OfType<OpeningStockReceivedIntegrationEvent>().ShouldHaveSingleItem();
        opening.Funding.ShouldBe(funding);
        opening.Amount.ShouldBe(50m);
        opening.Narration.ShouldContain("no supplier bill");
    }

    [Fact]
    public async Task Unknown_Ambiguous_Or_Invalid_Rows_Should_Fail_And_Receive_Nothing()
    {
        await SeedMedicineAsync("Cetirizine", "10mg", "Tablet");
        await SeedMedicineAsync("Twin");
        await SeedMedicineAsync("Twin");

        var result = await Sut().Handle(new ImportOpeningStockCommand([
            new OpeningStockImportRow(2, MedicineName: "Cetirizine", Strength: "10mg", Form: "Tablet", Quantity: 5m, CostPrice: 1m),
            new OpeningStockImportRow(3, MedicineName: "Cetirizine", Strength: "5mg", Form: "Tablet", Quantity: 5m, CostPrice: 1m),
            new OpeningStockImportRow(4, MedicineName: "Twin", Quantity: 1m, CostPrice: 1m),
            new OpeningStockImportRow(5, Barcode: "000", Quantity: 1m),
            new OpeningStockImportRow(6, Quantity: 0m, CostPrice: -1m),
            new OpeningStockImportRow(7, MedicineName: "Cetirizine", Strength: "10mg", Form: "Tablet", Quantity: 1m,
                ExpiryDate: DateOnly.FromDateTime(DateTime.UtcNow.AddDays(-2))),
        ]), CancellationToken.None);

        result.Committed.ShouldBeFalse();
        result.Received.ShouldBe(1);
        result.Failed.ShouldBe(5);
        result.Rows.Single(r => r.RowNumber == 3).Errors.ShouldContain(e => e.Field == "medicine_name");
        result.Rows.Single(r => r.RowNumber == 4).Errors.ShouldContain(e => e.Message.Contains("barcode", StringComparison.Ordinal));
        result.Rows.Single(r => r.RowNumber == 5).Errors.ShouldContain(e => e.Field == "barcode");
        result.Rows.Single(r => r.RowNumber == 6).Errors.Select(e => e.Field).ShouldBe(["medicine", "quantity", "cost_price"], ignoreOrder: true);
        result.Rows.Single(r => r.RowNumber == 7).Errors.ShouldContain(e => e.Field == "expiry_date");

        _db.MedicineBatches.ShouldBeEmpty();
        _events.ShouldBeEmpty();
    }

    [Fact]
    public async Task Existing_Lot_Should_Be_Topped_Up_When_The_Expiry_Matches_And_Refused_When_It_Does_Not()
    {
        var med = await SeedMedicineAsync("Paracetamol");
        var lot = MedicineBatch.Create(med.Id, _branchId, "B-1", NextYear, 20m, 2m, 3m, null);
        _db.MedicineBatches.Add(lot);
        await _db.SaveChangesAsync();

        var mismatch = await Sut().Handle(new ImportOpeningStockCommand([
            new OpeningStockImportRow(2, MedicineName: "Paracetamol", BatchNo: "b-1", ExpiryDate: NextYear.AddMonths(1), Quantity: 5m, CostPrice: 2m),
        ]), CancellationToken.None);
        mismatch.Committed.ShouldBeFalse();
        mismatch.Rows[0].Errors.ShouldContain(e => e.Field == "expiry_date");

        var topUp = await Sut().Handle(new ImportOpeningStockCommand([
            new OpeningStockImportRow(2, MedicineName: "Paracetamol", BatchNo: "B-1", ExpiryDate: NextYear, Quantity: 5m, CostPrice: 2m),
        ]), CancellationToken.None);
        topUp.Committed.ShouldBeTrue();
        topUp.Rows[0].Warnings.ShouldContain(w => w.Contains("already in stock", StringComparison.Ordinal) && w.Contains("counted twice", StringComparison.Ordinal));
        (await _db.MedicineBatches.SingleAsync()).QuantityOnHand.ShouldBe(25m);
    }

    [Fact]
    public async Task Consigned_Lot_Should_Not_Take_Owned_Stock()
    {
        var med = await SeedMedicineAsync("Insulin");
        var lot = MedicineBatch.Create(med.Id, _branchId, "C-1", NextYear, 10m, 100m, 150m, null);
        _db.MedicineBatches.Add(lot);
        _db.ConsignmentPositions.Add(ConsignmentPosition.Create(Guid.CreateVersion7(), med.Id, lot.Id, "C-1", 10m, 100m, DateTime.UtcNow, _branchId));
        await _db.SaveChangesAsync();

        var result = await Sut().Handle(new ImportOpeningStockCommand([
            new OpeningStockImportRow(2, MedicineName: "Insulin", BatchNo: "C-1", Quantity: 1m, CostPrice: 100m),
        ]), CancellationToken.None);

        result.Rows[0].Errors.ShouldContain(e => e.Field == "batch_no");
    }

    [Fact]
    public async Task Consignment_Import_Should_Open_Own_Lots_With_Positions_And_Post_No_Voucher()
    {
        var insulin = await SeedMedicineAsync("Insulin");
        var ors = await SeedMedicineAsync("ORS");
        var supplierId = Guid.CreateVersion7();

        var result = await Sut().Handle(new ImportOpeningStockCommand([
            new OpeningStockImportRow(2, MedicineName: "Insulin", BatchNo: "ins 7", ExpiryDate: NextYear, Quantity: 10m, CostPrice: 100m, SellingPrice: 150m),
            new OpeningStockImportRow(3, MedicineName: "ORS", Quantity: 40m, CostPrice: 5m),
        ], ConsignmentSupplierId: supplierId), CancellationToken.None);

        result.Committed.ShouldBeTrue();
        result.Funding.ShouldBe(OpeningStockImportModes.Consignment);
        result.TotalValue.ShouldBe(1200m);
        _events.ShouldBeEmpty();

        var positions = await _db.ConsignmentPositions.OrderBy(p => p.QuantityReceived).ToListAsync();
        positions.Count.ShouldBe(2);
        positions.ShouldAllBe(p => p.SupplierId == supplierId && p.BranchId == _branchId && p.SettledQuantity == 0m);
        positions[0].MedicineId.ShouldBe(insulin.Id);
        positions[0].BatchNo.ShouldBe("INS 7");
        positions[0].UnitCostPrice.ShouldBe(100m);
        positions[1].MedicineId.ShouldBe(ors.Id);
        positions[1].BatchNo.ShouldStartWith("CONSIGN-");

        var lots = await _db.MedicineBatches.ToListAsync();
        lots.Select(l => l.Id).ShouldBe(positions.Select(p => p.BatchId), ignoreOrder: true);
        lots.Single(l => l.MedicineId == insulin.Id).SellingPrice.ShouldBe(150m);
    }

    [Fact]
    public async Task Consignment_Import_Should_Refuse_A_Batch_Already_In_Stock_Or_Twice_In_The_File()
    {
        var med = await SeedMedicineAsync("Paracetamol");
        _db.MedicineBatches.Add(MedicineBatch.Create(med.Id, _branchId, "B-1", NextYear, 20m, 2m, 3m, null));
        await _db.SaveChangesAsync();

        var result = await Sut().Handle(new ImportOpeningStockCommand([
            new OpeningStockImportRow(2, MedicineName: "Paracetamol", BatchNo: "b-1", ExpiryDate: NextYear, Quantity: 5m, CostPrice: 2m),
            new OpeningStockImportRow(3, MedicineName: "Paracetamol", BatchNo: "B-2", Quantity: 5m, CostPrice: 2m),
            new OpeningStockImportRow(4, MedicineName: "Paracetamol", BatchNo: "B-2", Quantity: 5m, CostPrice: 2m),
        ], ConsignmentSupplierId: Guid.CreateVersion7()), CancellationToken.None);

        result.Committed.ShouldBeFalse();
        result.Rows[0].Errors.ShouldContain(e => e.Field == "batch_no" && e.Message.Contains("own lot", StringComparison.Ordinal));
        result.Rows[1].Errors.ShouldBeEmpty();
        result.Rows[2].Errors.ShouldContain(e => e.Field == "batch_no" && e.Message.Contains("Row 3", StringComparison.Ordinal));
        (await _db.MedicineBatches.SingleAsync()).QuantityOnHand.ShouldBe(20m);
        _db.ConsignmentPositions.ShouldBeEmpty();
    }

    [Fact]
    public async Task Go_Live_File_Should_Create_Missing_Medicines_And_Mix_Owned_And_Consigned_Stock()
    {
        var cetamol = await SeedMedicineAsync("Cetamol", "500mg", "Tablet");
        var supplierId = Guid.CreateVersion7();

        var result = await Sut().Handle(new ImportOpeningStockCommand([
            new OpeningStockImportRow(2, MedicineName: "Cetamol", Strength: "500mg", Form: "Tablet", BatchNo: "C-1",
                ExpiryDate: NextYear, Quantity: 100m, CostPrice: 1m, SellingPrice: 2m),
            new OpeningStockImportRow(3, MedicineName: "Cefixime", Strength: "200mg", Form: "Tablet", Barcode: "890100",
                BatchNo: "CF-1", ExpiryDate: NextYear, Quantity: 50m, CostPrice: 18m, SellingPrice: 25m,
                GenericName: "Cefixime", IsTaxable: false, UnitsPerPack: 10, ReorderLevel: 20m),
            new OpeningStockImportRow(4, MedicineName: "cefixime", Strength: "200 MG", Form: "tablet", BatchNo: "CF-C1",
                ExpiryDate: NextYear, Quantity: 30m, CostPrice: 18m, SellingPrice: 25m, ConsignmentSupplierId: supplierId),
        ], CreateMissingMedicines: true), CancellationToken.None);

        result.Committed.ShouldBeTrue();
        result.Funding.ShouldBe(StockFundingSources.OpeningStock);
        result.Rows.Select(r => r.NewMedicine).ShouldBe([false, true, true]);
        result.Rows.Select(r => r.Consigned).ShouldBe([false, false, true]);
        result.Rows.ShouldAllBe(r => r.BatchId != null);

        var cefixime = await _db.Medicines.SingleAsync(m => m.Name == "Cefixime");
        cefixime.UnitPrice.ShouldBe(25m);
        cefixime.Barcode.ShouldBe("890100");
        cefixime.IsTaxable.ShouldBeFalse();
        cefixime.UnitsPerPack.ShouldBe(10);
        cefixime.GenericName.ShouldBe("Cefixime");
        (await _db.Medicines.CountAsync()).ShouldBe(2);

        // Only the owned stock is valued in the opening voucher; the consigned lot has a position instead.
        _events.OfType<OpeningStockReceivedIntegrationEvent>().ShouldHaveSingleItem().Amount.ShouldBe(100m + 900m);
        var position = await _db.ConsignmentPositions.SingleAsync();
        position.SupplierId.ShouldBe(supplierId);
        position.MedicineId.ShouldBe(cefixime.Id);
        position.QuantityReceived.ShouldBe(30m);
        (await _db.MedicineBatches.CountAsync(b => b.MedicineId == cefixime.Id)).ShouldBe(2);
        (await _db.MedicineBatches.SingleAsync(b => b.MedicineId == cetamol.Id)).QuantityOnHand.ShouldBe(100m);
    }

    [Fact]
    public async Task A_New_Medicine_Row_Should_Need_Its_Price_And_A_Preview_Should_Create_Nothing()
    {
        var result = await Sut().Handle(new ImportOpeningStockCommand([
            new OpeningStockImportRow(2, MedicineName: "Zinc", Strength: "20mg", Quantity: 10m, CostPrice: 1m),
            new OpeningStockImportRow(3, MedicineName: "ORS", Form: "Sachet", Quantity: 10m, CostPrice: 1m, SellingPrice: 2m),
        ], CreateMissingMedicines: true, DryRun: true), CancellationToken.None);

        result.Rows[0].Errors.Select(e => e.Field).ShouldBe(["selling_price"]);
        result.Rows[1].Errors.ShouldBeEmpty();
        result.Rows[1].NewMedicine.ShouldBeTrue();
        result.Rows[1].MedicineId.ShouldBeNull();
        result.Rows[1].Warnings.ShouldContain(w => w.StartsWith("New medicine", StringComparison.Ordinal));
        _db.Medicines.ShouldBeEmpty();
    }

    [Fact]
    public async Task A_New_Medicine_Without_A_Form_Should_Be_Saved_As_Other_And_Found_Again_On_A_Re_Upload()
    {
        var row = new OpeningStockImportRow(2, MedicineName: "Zinc", Strength: "20mg", Quantity: 10m, CostPrice: 1m, SellingPrice: 3m);

        var first = await Sut().Handle(new ImportOpeningStockCommand([row], CreateMissingMedicines: true), CancellationToken.None);

        first.Committed.ShouldBeTrue();
        first.Rows[0].Warnings.ShouldContain(w => w.StartsWith("No form", StringComparison.Ordinal));
        (await _db.Medicines.SingleAsync()).Form.ShouldBe(OpeningStockImportDefaults.Form);

        var again = await Sut().Handle(new ImportOpeningStockCommand([row with { Quantity = 0m }], CreateMissingMedicines: true, DryRun: true),
            CancellationToken.None);
        again.Rows[0].NewMedicine.ShouldBeFalse();
        again.Rows[0].Status.ShouldBe(OpeningStockImportRowStatuses.CardOnly);
    }

    [Fact]
    public async Task Go_Live_Rows_Without_A_Quantity_Should_Add_Only_The_Medicine_Card()
    {
        var ors = await SeedMedicineAsync("ORS");
        var expired = DateOnly.FromDateTime(DateTime.UtcNow.AddDays(-2));

        var result = await Sut().Handle(new ImportOpeningStockCommand([
            new OpeningStockImportRow(2, MedicineName: "Cefixime", Strength: "200mg", Form: "Tablet", SellingPrice: 25m,
                BatchNo: "CF-1", ExpiryDate: expired),
            new OpeningStockImportRow(3, MedicineName: "ORS"),
            new OpeningStockImportRow(4, MedicineName: "Zinc", Form: "Tablet", Quantity: 10m, CostPrice: 2m, SellingPrice: 3m),
        ], CreateMissingMedicines: true), CancellationToken.None);

        result.Committed.ShouldBeTrue();
        result.Rows.Select(r => r.Status).ShouldBe([
            OpeningStockImportRowStatuses.CardOnly, OpeningStockImportRowStatuses.CardOnly, OpeningStockImportRowStatuses.Received]);
        result.Rows[0].Errors.ShouldBeEmpty();
        result.Rows[0].Warnings.ShouldContain(w => w.StartsWith("No quantity", StringComparison.Ordinal));
        result.Rows[0].Warnings.ShouldContain(w => w.StartsWith("Batch, expiry and rack are ignored", StringComparison.Ordinal));
        result.Rows[1].MedicineId.ShouldBe(ors.Id);
        result.Rows[1].Warnings.ShouldContain(w => w.StartsWith("Already in your list", StringComparison.Ordinal));
        result.Received.ShouldBe(1);
        result.MedicinesOnly.ShouldBe(2);
        result.TotalValue.ShouldBe(20m);

        var cefixime = await _db.Medicines.SingleAsync(m => m.Name == "Cefixime");
        cefixime.UnitPrice.ShouldBe(25m);
        (await _db.MedicineBatches.CountAsync(b => b.MedicineId == cefixime.Id)).ShouldBe(0);
        (await _db.MedicineBatches.CountAsync()).ShouldBe(1);
        _events.OfType<OpeningStockReceivedIntegrationEvent>().ShouldHaveSingleItem().Amount.ShouldBe(20m);
    }

    [Fact]
    public async Task A_File_Of_Only_Medicine_Cards_Should_Post_No_Voucher()
    {
        var result = await Sut().Handle(new ImportOpeningStockCommand([
            new OpeningStockImportRow(2, MedicineName: "Cefixime", Form: "Tablet", SellingPrice: 25m),
        ], CreateMissingMedicines: true), CancellationToken.None);

        result.Committed.ShouldBeTrue();
        result.MedicinesOnly.ShouldBe(1);
        (await _db.Medicines.CountAsync()).ShouldBe(1);
        _db.MedicineBatches.ShouldBeEmpty();
        _events.ShouldBeEmpty();
    }

    [Fact]
    public async Task No_Quantity_Should_Still_Fail_Outside_Go_Live_And_For_Consigned_Rows()
    {
        await SeedMedicineAsync("ORS");

        var plain = await Sut().Handle(new ImportOpeningStockCommand([new OpeningStockImportRow(2, MedicineName: "ORS")]), CancellationToken.None);
        plain.Rows[0].Errors.ShouldContain(e => e.Field == "quantity");

        var consigned = await Sut().Handle(new ImportOpeningStockCommand([
            new OpeningStockImportRow(2, MedicineName: "ORS", ConsignmentSupplierId: Guid.CreateVersion7()),
        ], CreateMissingMedicines: true), CancellationToken.None);
        consigned.Committed.ShouldBeFalse();
        consigned.Rows[0].Errors.ShouldContain(e => e.Field == "quantity" && e.Message.StartsWith("Consignment", StringComparison.Ordinal));

        var negative = await Sut().Handle(new ImportOpeningStockCommand([
            new OpeningStockImportRow(2, MedicineName: "ORS", Quantity: -1m),
        ], CreateMissingMedicines: true), CancellationToken.None);
        negative.Rows[0].Errors.ShouldContain(e => e.Field == "quantity");
        _db.MedicineBatches.ShouldBeEmpty();
    }

    [Fact]
    public async Task Missing_Medicines_Should_Still_Fail_Without_The_Go_Live_Flag()
    {
        var result = await Sut().Handle(new ImportOpeningStockCommand([
            new OpeningStockImportRow(2, MedicineName: "ORS", Form: "Sachet", Quantity: 10m, CostPrice: 1m, SellingPrice: 2m),
        ]), CancellationToken.None);

        result.Rows[0].Errors.ShouldContain(e => e.Field == "medicine_name");
        _db.Medicines.ShouldBeEmpty();
    }

    [Fact]
    public async Task Creating_Medicines_Or_Receiving_Consignment_Should_Need_Their_Own_Permissions()
    {
        await SeedMedicineAsync("ORS");
        _permissions.HasPermissionAsync(Arg.Any<string>(), Arg.Any<string>(), Arg.Any<CancellationToken>()).Returns(false);

        await Should.ThrowAsync<FSH.Framework.Core.Exceptions.CustomException>(() => Sut().Handle(new ImportOpeningStockCommand([
            new OpeningStockImportRow(2, MedicineName: "Zinc", Form: "Tablet", Quantity: 1m, CostPrice: 1m, SellingPrice: 2m),
        ], CreateMissingMedicines: true), CancellationToken.None).AsTask());
        await Should.ThrowAsync<FSH.Framework.Core.Exceptions.CustomException>(() => Sut().Handle(new ImportOpeningStockCommand([
            new OpeningStockImportRow(2, MedicineName: "ORS", Quantity: 1m, CostPrice: 1m),
        ], ConsignmentSupplierId: Guid.CreateVersion7()), CancellationToken.None).AsTask());

        // Owned stock for an existing medicine needs nothing extra.
        (await Sut().Handle(new ImportOpeningStockCommand([new OpeningStockImportRow(2, MedicineName: "ORS", Quantity: 1m, CostPrice: 1m)]),
            CancellationToken.None)).Committed.ShouldBeTrue();
    }

    [Fact]
    public async Task Dry_Run_Should_Resolve_But_Not_Receive()
    {
        var med = await SeedMedicineAsync("ORS");

        var result = await Sut().Handle(
            new ImportOpeningStockCommand([new OpeningStockImportRow(2, MedicineName: "ors", Quantity: 3m, CostPrice: 2m)], DryRun: true),
            CancellationToken.None);

        result.DryRun.ShouldBeTrue();
        result.Rows[0].MedicineId.ShouldBe(med.Id);
        result.Rows[0].MedicineLabel.ShouldBe("ORS");
        _db.MedicineBatches.ShouldBeEmpty();
        _events.ShouldBeEmpty();
    }

    [Fact]
    public void Validator_Should_Reject_Unknown_Funding_And_Too_Many_Rows()
    {
        var validator = new ImportOpeningStockCommandValidator();
        var row = new OpeningStockImportRow(2, MedicineName: "X", Quantity: 1m);

        validator.TestValidate(new ImportOpeningStockCommand([row], "credit")).ShouldHaveValidationErrorFor(c => c.Funding);
        validator.TestValidate(new ImportOpeningStockCommand(Enumerable.Repeat(row, OpeningStockImportLimits.MaxRows + 1).ToList()))
            .Errors.ShouldNotBeEmpty();
        validator.TestValidate(new ImportOpeningStockCommand([row], StockFundingSources.Cash)).ShouldNotHaveAnyValidationErrors();
        validator.TestValidate(new ImportOpeningStockCommand([row], StockFundingSources.Cash, ConsignmentSupplierId: Guid.CreateVersion7()))
            .ShouldHaveValidationErrorFor(c => c.Funding);
        validator.TestValidate(new ImportOpeningStockCommand([row], ConsignmentSupplierId: Guid.Empty))
            .ShouldHaveValidationErrorFor(c => c.ConsignmentSupplierId);
        validator.TestValidate(new ImportOpeningStockCommand([row], ConsignmentSupplierId: Guid.CreateVersion7())).ShouldNotHaveAnyValidationErrors();
    }
}

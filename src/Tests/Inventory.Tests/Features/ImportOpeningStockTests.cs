using FluentValidation.TestHelper;
using FSH.Framework.Core.Context;
using FSH.Framework.Eventing.Abstractions;
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
    private readonly List<IIntegrationEvent> _events = [];
    private readonly Guid _branchId = Guid.CreateVersion7();
    private static readonly DateOnly NextYear = DateOnly.FromDateTime(DateTime.UtcNow.AddYears(1));

    public ImportOpeningStockTests()
    {
        _currentBranch.RequireBranchIdAsync(Arg.Any<CancellationToken>()).Returns(_branchId);
        _currentBranch.GetBranchIdAsync(Arg.Any<CancellationToken>()).Returns(_branchId);
        _outbox.AddAsync(Arg.Do<IIntegrationEvent>(_events.Add), Arg.Any<CancellationToken>()).Returns(Task.CompletedTask);
    }

    public void Dispose() => _db.Dispose();

    private ImportOpeningStockCommandHandler Sut() =>
        new(_db, new StockReceiptService(_db, _currentBranch), _outbox, Substitute.For<ICurrentUser>(), _currentBranch);

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
    }
}

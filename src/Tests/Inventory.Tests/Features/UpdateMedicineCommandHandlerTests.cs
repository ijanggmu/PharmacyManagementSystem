using System.Net;
using FSH.Framework.Core.Context;
using FSH.Framework.Core.Exceptions;
using FSH.Framework.Eventing.Abstractions;
using FSH.Modules.Inventory.Contracts.v1.Medicines;
using FSH.Modules.Inventory.Data;
using FSH.Modules.Inventory.Domain;
using FSH.Modules.Inventory.Features.v1.Medicines.GetMedicineById;
using FSH.Modules.Inventory.Features.v1.Medicines.UpdateMedicine;
using FSH.Modules.Inventory.Services;
using FSH.Modules.Multitenancy.Contracts;
using NSubstitute;

namespace Inventory.Tests.Features;

public sealed class UpdateMedicineCommandHandlerTests : IDisposable
{
    private readonly InventoryDbContext _db = InventoryDbContextFactory.Create();
    private readonly UpdateMedicineCommandHandler _sut;

    public UpdateMedicineCommandHandlerTests()
    {
        var currentBranch = Substitute.For<ICurrentBranch>();
        currentBranch.RequireBranchIdAsync(Arg.Any<CancellationToken>()).Returns(Guid.CreateVersion7());

        _sut = new UpdateMedicineCommandHandler(
            _db,
            new StockReceiptService(_db, currentBranch),
            currentBranch,
            Substitute.For<IOutboxWriter>(),
            Substitute.For<ICurrentUser>(),
            Substitute.For<FSH.Modules.Identity.Contracts.Services.IApprovalService>());
    }

    private async Task<Medicine> SeedMedicineAsync()
    {
        var medicine = Medicine.Create("Ibuprofen", null, null, reorderLevel: 5);
        _db.Medicines.Add(medicine);
        await _db.SaveChangesAsync();
        return medicine;
    }

    [Fact]
    public async Task Handle_Should_Update_Fields_Without_Touching_Batches_When_No_Stock_Adjustment()
    {
        var medicine = await SeedMedicineAsync();

        var command = new UpdateMedicineCommand(medicine.Id, "Ibuprofen 400mg", "Ibuprofen", null, ReorderLevel: 20);
        await _sut.Handle(command, CancellationToken.None);

        var updated = await _db.Medicines.FindAsync(medicine.Id);
        updated!.Name.ShouldBe("Ibuprofen 400mg");
        updated.ReorderLevel.ShouldBe(20m);
        _db.MedicineBatches.Count(b => b.MedicineId == medicine.Id).ShouldBe(0);
    }

    [Fact]
    public async Task Handle_Should_Receive_New_Batch_When_Stock_Adjustment_Requested()
    {
        var medicine = await SeedMedicineAsync();
        var expiry = DateOnly.FromDateTime(DateTime.UtcNow.AddMonths(3));

        var command = new UpdateMedicineCommand(
            medicine.Id,
            "Ibuprofen",
            null,
            null,
            ReorderLevel: 5,
            InitialStockQuantity: 50m,
            BatchNumber: "ADJ-001",
            ExpiryDate: expiry,
            RackLocation: "B2",
            CostPrice: 1m,
            SellingPrice: 2m);

        await _sut.Handle(command, CancellationToken.None);

        var batch = _db.MedicineBatches.Single(b => b.MedicineId == medicine.Id);
        batch.BatchNo.ShouldBe("ADJ-001");
        batch.QuantityOnHand.ShouldBe(50m);

        var transaction = _db.InventoryTransactions.Single(t => t.MedicineId == medicine.Id);
        transaction.ReferenceType.ShouldBe("MedicineStockAdjustment");
    }

    /// <summary>A medicine with a received lot: 10 mg tablets, taxable, sold in strips of 10, opening bill INV-1 with VAT 13.</summary>
    private async Task<Medicine> SeedMedicineWithStockAsync()
    {
        var medicine = Medicine.Create(
            "Cetirizine", null, null, reorderLevel: 5, unitPrice: 2m, costPrice: 1m, form: "Tablet", strength: "10mg",
            dosage: "1 at night", unitsPerPack: 10, unitLabel: "strip", isTaxable: true,
            supplierInvoiceNumber: "INV-1", vatAmount: 13m);
        _db.Medicines.Add(medicine);
        _db.MedicineBatches.Add(MedicineBatch.Create(
            medicine.Id, Guid.CreateVersion7(), "B1", DateOnly.FromDateTime(DateTime.UtcNow.AddYears(1)), 20m, 1m, 2m, null));
        await _db.SaveChangesAsync();
        return medicine;
    }

    [Theory]
    [InlineData(MedicineStockHistory.StrengthField)]
    [InlineData(MedicineStockHistory.FormField)]
    [InlineData(MedicineStockHistory.UnitsPerPackField)]
    [InlineData(MedicineStockHistory.UnitLabelField)]
    [InlineData(MedicineStockHistory.SupplierInvoiceField)]
    [InlineData(MedicineStockHistory.VatAmountField)]
    public async Task Handle_Should_Refuse_Changing_Locked_Details_Once_Stock_Is_On_Record(string field)
    {
        var medicine = await SeedMedicineWithStockAsync();
        var unchanged = new UpdateMedicineCommand(medicine.Id, "Cetirizine 10mg");
        var command = field switch
        {
            MedicineStockHistory.StrengthField => unchanged with { Strength = "20mg", Form = "Tablet" },
            MedicineStockHistory.FormField => unchanged with { Strength = "10mg", Form = "Syrup" },
            MedicineStockHistory.UnitsPerPackField => unchanged with { UnitsPerPack = 15 },
            MedicineStockHistory.UnitLabelField => unchanged with { UnitLabel = "tablet" },
            MedicineStockHistory.SupplierInvoiceField => unchanged with { SupplierInvoiceNumber = "INV-2" },
            _ => unchanged with { VatAmount = 5m },
        };

        var ex = await Should.ThrowAsync<CustomException>(() => _sut.Handle(command, CancellationToken.None).AsTask());

        ex.StatusCode.ShouldBe(HttpStatusCode.Conflict);
        ex.Message.ShouldContain(field);
        // Nothing of the edit is applied, not even the editable name.
        _db.ChangeTracker.Clear();
        var stored = await _db.Medicines.FindAsync(medicine.Id);
        stored!.Name.ShouldBe("Cetirizine");
        stored.Strength.ShouldBe("10mg");
        stored.Form.ShouldBe("Tablet");
        stored.UnitsPerPack.ShouldBe(10);
        stored.UnitLabel.ShouldBe("strip");
        stored.SupplierInvoiceNumber.ShouldBe("INV-1");
        stored.VatAmount.ShouldBe(13m);
    }

    [Fact]
    public async Task Handle_Should_Allow_Editable_Fields_And_Unchanged_Locked_Values_With_Stock_On_Record()
    {
        var medicine = await SeedMedicineWithStockAsync();

        await _sut.Handle(
            new UpdateMedicineCommand(
                medicine.Id, "Cetirizine 10mg", "Cetirizine", ReorderLevel: 8, UnitPrice: 3m, CostPrice: 1.5m,
                IsTaxable: true, Form: "tablet", Strength: "10 MG", UnitsPerPack: 10, UnitLabel: " strip ", SupplierInvoiceNumber: "INV-1", VatAmount: 13m),
            CancellationToken.None);

        var stored = await _db.Medicines.FindAsync(medicine.Id);
        stored!.Name.ShouldBe("Cetirizine 10mg");
        stored.ReorderLevel.ShouldBe(8m);
        stored.UnitPrice.ShouldBe(3m);
        stored.CostPrice.ShouldBe(1.5m);
        // Spacing and case are not a different product.
        stored.Strength.ShouldBe("10 MG");
        // Lots keep the cost they were bought at: the medicine's cost is only the default for new stock.
        _db.MedicineBatches.Single(b => b.MedicineId == medicine.Id).CostPrice.ShouldBe(1m);
    }

    [Fact]
    public async Task Handle_Should_Keep_Locked_Details_When_Clearing_Optional_Details_With_Stock_On_Record()
    {
        var medicine = await SeedMedicineWithStockAsync();

        await _sut.Handle(
            new UpdateMedicineCommand(medicine.Id, "Cetirizine", ClearOptionalDetails: true),
            CancellationToken.None);

        var stored = await _db.Medicines.FindAsync(medicine.Id);
        stored!.Dosage.ShouldBeNull();
        stored.Strength.ShouldBe("10mg");
        stored.Form.ShouldBe("Tablet");
        stored.UnitsPerPack.ShouldBe(10);
        stored.UnitLabel.ShouldBe("strip");
        stored.SupplierInvoiceNumber.ShouldBe("INV-1");
        stored.VatAmount.ShouldBe(13m);
    }

    [Fact]
    public async Task Handle_Should_Correct_The_Vat_Flag_With_Stock_On_Record_Without_Touching_Bought_Lots()
    {
        var medicine = await SeedMedicineWithStockAsync();

        await _sut.Handle(new UpdateMedicineCommand(medicine.Id, "Cetirizine", IsTaxable: false), CancellationToken.None);

        (await _db.Medicines.FindAsync(medicine.Id))!.IsTaxable.ShouldBeFalse();
        // The lot was bought as VAT-able; a supplier return of it still reverses that VAT.
        _db.MedicineBatches.Single(b => b.MedicineId == medicine.Id).IsTaxable.ShouldBeTrue();
    }

    [Fact]
    public async Task Handle_Should_Open_A_New_Lot_Under_The_Medicines_Current_Vat_Flag()
    {
        var medicine = await SeedMedicineAsync();

        await _sut.Handle(
            new UpdateMedicineCommand(
                medicine.Id, "Ibuprofen", IsTaxable: false, InitialStockQuantity: 5m, BatchNumber: "NV-1",
                ExpiryDate: DateOnly.FromDateTime(DateTime.UtcNow.AddMonths(6)), CostPrice: 1m, SellingPrice: 2m),
            CancellationToken.None);

        _db.MedicineBatches.Single(b => b.MedicineId == medicine.Id).IsTaxable.ShouldBeFalse();
    }

    [Fact]
    public async Task Handle_Should_Allow_Changing_Tax_And_Pack_Before_Any_Stock()
    {
        var medicine = await SeedMedicineAsync();

        await _sut.Handle(
            new UpdateMedicineCommand(medicine.Id, "Ibuprofen", IsTaxable: false, UnitsPerPack: 12, UnitLabel: "tablet"),
            CancellationToken.None);

        var stored = await _db.Medicines.FindAsync(medicine.Id);
        stored!.IsTaxable.ShouldBeFalse();
        stored.UnitsPerPack.ShouldBe(12);
        stored.UnitLabel.ShouldBe("tablet");
    }

    [Fact]
    public async Task GetById_Should_Report_Stock_History()
    {
        var withStock = await SeedMedicineWithStockAsync();
        var withoutStock = await SeedMedicineAsync();
        var handler = new GetMedicineByIdQueryHandler(_db, TimeProvider.System, Substitute.For<ICurrentBranch>());

        (await handler.Handle(new GetMedicineByIdQuery(withStock.Id), CancellationToken.None)).HasStockHistory.ShouldBeTrue();
        (await handler.Handle(new GetMedicineByIdQuery(withoutStock.Id), CancellationToken.None)).HasStockHistory.ShouldBeFalse();
    }

    public void Dispose() => _db.Dispose();
}

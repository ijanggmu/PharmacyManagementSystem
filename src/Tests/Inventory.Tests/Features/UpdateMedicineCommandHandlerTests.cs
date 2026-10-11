using FSH.Framework.Core.Context;
using FSH.Framework.Eventing.Abstractions;
using FSH.Modules.Inventory.Contracts.v1.Medicines;
using FSH.Modules.Inventory.Data;
using FSH.Modules.Inventory.Domain;
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
            Substitute.For<ICurrentUser>());
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

    public void Dispose() => _db.Dispose();
}

using FSH.Framework.Core.Context;
using FSH.Framework.Eventing.Abstractions;
using FSH.Modules.Inventory.Contracts.v1.Medicines;
using FSH.Modules.Inventory.Data;
using FSH.Modules.Inventory.Features.v1.Medicines.CreateMedicine;
using FSH.Modules.Inventory.Services;
using FSH.Modules.Multitenancy.Contracts;
using NSubstitute;

namespace Inventory.Tests.Features;

public sealed class CreateMedicineCommandHandlerTests : IDisposable
{
    private readonly InventoryDbContext _db = InventoryDbContextFactory.Create();
    private readonly CreateMedicineCommandHandler _sut;

    public CreateMedicineCommandHandlerTests()
    {
        var currentBranch = Substitute.For<ICurrentBranch>();
        currentBranch.RequireBranchIdAsync(Arg.Any<CancellationToken>()).Returns(Guid.CreateVersion7());

        _sut = new CreateMedicineCommandHandler(
            _db,
            new StockReceiptService(_db, currentBranch),
            Substitute.For<IOutboxWriter>(),
            Substitute.For<ICurrentUser>(),
            currentBranch);
    }

    [Fact]
    public async Task Handle_Should_Create_Medicine_With_No_Batch_When_No_Initial_Stock_Given()
    {
        var command = new CreateMedicineCommand("Paracetamol", "Acetaminophen", null, ReorderLevel: 10);

        var medicineId = await _sut.Handle(command, CancellationToken.None);

        var medicine = await _db.Medicines.FindAsync(medicineId);
        medicine.ShouldNotBeNull();
        medicine!.Name.ShouldBe("Paracetamol");
        _db.MedicineBatches.Count(b => b.MedicineId == medicineId).ShouldBe(0);
    }

    [Fact]
    public async Task Handle_Should_Seed_Initial_Batch_When_InitialStockQuantity_Provided()
    {
        var expiry = DateOnly.FromDateTime(DateTime.UtcNow.AddMonths(6));
        var command = new CreateMedicineCommand(
            "Amoxicillin",
            null,
            null,
            ReorderLevel: 5,
            InitialStockQuantity: 100m,
            BatchNumber: "BATCH-001",
            ExpiryDate: expiry,
            RackLocation: "A1",
            CostPrice: 2m,
            SellingPrice: 3.5m);

        var medicineId = await _sut.Handle(command, CancellationToken.None);

        var batch = _db.MedicineBatches.Single(b => b.MedicineId == medicineId);
        batch.BatchNo.ShouldBe("BATCH-001");
        batch.ExpiryDate.ShouldBe(expiry);
        batch.QuantityOnHand.ShouldBe(100m);
        batch.RackLocation.ShouldBe("A1");
        batch.CostPrice.ShouldBe(2m);
        batch.SellingPrice.ShouldBe(3.5m);
        batch.IsDisposed.ShouldBeFalse();

        var transaction = _db.InventoryTransactions.Single(t => t.MedicineId == medicineId);
        transaction.ReferenceType.ShouldBe("MedicineCreate");
    }

    public void Dispose() => _db.Dispose();
}

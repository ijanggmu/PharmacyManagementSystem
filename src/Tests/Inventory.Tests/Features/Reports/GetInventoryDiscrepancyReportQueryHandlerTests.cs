using FSH.Modules.Inventory.Contracts.v1.Reports;
using FSH.Modules.Inventory.Data;
using FSH.Modules.Inventory.Domain;
using FSH.Modules.Inventory.Features.v1.Reports.GetInventoryDiscrepancyReport;
using Inventory.Tests.Features;

namespace Inventory.Tests.Features.Reports;

public sealed class GetInventoryDiscrepancyReportQueryHandlerTests : IDisposable
{
    private readonly InventoryDbContext _db = InventoryDbContextFactory.Create();
    private readonly GetInventoryDiscrepancyReportQueryHandler _sut;

    public GetInventoryDiscrepancyReportQueryHandlerTests()
    {
        _sut = new GetInventoryDiscrepancyReportQueryHandler(_db, TimeProvider.System);
    }

    private async Task<Medicine> SeedAsync(decimal reorderLevel, decimal onHand)
    {
        var medicine = Medicine.Create($"Med-{Guid.NewGuid():N}", null, null, reorderLevel, isControlled: false);
        _db.Medicines.Add(medicine);

        if (onHand > 0)
        {
            _db.MedicineBatches.Add(MedicineBatch.Create(
                medicine.Id, Guid.CreateVersion7(), "B1", DateOnly.FromDateTime(DateTime.UtcNow.AddYears(1)), onHand, 1m, 2m, null));
        }

        await _db.SaveChangesAsync(CancellationToken.None);
        return medicine;
    }

    [Fact]
    public async Task Handle_Should_Flag_Medicine_Below_ReorderLevel()
    {
        // Arrange
        var low = await SeedAsync(reorderLevel: 20, onHand: 5);
        var healthy = await SeedAsync(reorderLevel: 20, onHand: 50);

        // Act
        var result = await _sut.Handle(new GetInventoryDiscrepancyReportQuery(), CancellationToken.None);

        // Assert
        result.TotalMedicines.ShouldBe(2);
        result.LowStockCount.ShouldBe(1);
        var flagged = result.LowStock.ShouldHaveSingleItem();
        flagged.MedicineId.ShouldBe(low.Id);
        flagged.CurrentStock.ShouldBe(5m);
        result.LowStock.ShouldNotContain(e => e.MedicineId == healthy.Id);
    }

    [Fact]
    public async Task Handle_Should_Flag_Medicine_With_Zero_Stock_And_Positive_ReorderLevel()
    {
        // Arrange — no batches at all (never stocked).
        var never = await SeedAsync(reorderLevel: 10, onHand: 0);

        // Act
        var result = await _sut.Handle(new GetInventoryDiscrepancyReportQuery(), CancellationToken.None);

        // Assert
        result.LowStock.ShouldContain(e => e.MedicineId == never.Id && e.CurrentStock == 0m);
    }

    [Fact]
    public async Task Handle_Should_Return_Empty_LowStock_When_All_Above_ReorderLevel()
    {
        await SeedAsync(reorderLevel: 5, onHand: 100);

        var result = await _sut.Handle(new GetInventoryDiscrepancyReportQuery(), CancellationToken.None);

        result.LowStockCount.ShouldBe(0);
        result.LowStock.ShouldBeEmpty();
    }

    public void Dispose() => _db.Dispose();
}

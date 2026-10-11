using FSH.Framework.Core.Context;
using FSH.Framework.Eventing.Abstractions;
using FSH.Modules.Inventory.Contracts.v1.Medicines;
using FSH.Modules.Inventory.Data;
using FSH.Modules.Inventory.Domain;
using FSH.Modules.Inventory.Features.v1.Medicines.PriceHistory;
using FSH.Modules.Inventory.Features.v1.Medicines.UpdateMedicine;
using FSH.Modules.Inventory.Services;
using FSH.Modules.Multitenancy.Contracts;
using NSubstitute;

namespace Inventory.Tests.Features;

/// <summary>Every price change, from the medicine form or a same-day schedule, lands in the price history.</summary>
public sealed class PriceChangeHistoryTests : IDisposable
{
    private readonly InventoryDbContext _db = InventoryDbContextFactory.Create();

    [Fact]
    public async Task UpdateMedicine_Should_Record_A_Price_Change_In_The_History()
    {
        var medicine = await SeedAsync(unitPrice: 10m, costPrice: 6m);

        await UpdateHandler().Handle(
            new UpdateMedicineCommand(medicine.Id, medicine.Name, UnitPrice: 12m, PriceChangeReason: "Supplier price rise"),
            CancellationToken.None);

        var row = _db.MedicinePriceHistories.ShouldHaveSingleItem();
        row.Status.ShouldBe(MedicinePriceHistoryStatus.Active);
        row.UnitPrice.ShouldBe(12m);
        row.CostPrice.ShouldBe(6m);
        row.Reason.ShouldBe("Supplier price rise");
    }

    [Fact]
    public async Task UpdateMedicine_Should_Supersede_The_Previous_Active_Price()
    {
        var medicine = await SeedAsync(unitPrice: 10m, costPrice: 6m);
        var sut = UpdateHandler();

        await sut.Handle(new UpdateMedicineCommand(medicine.Id, medicine.Name, UnitPrice: 12m), CancellationToken.None);
        await sut.Handle(new UpdateMedicineCommand(medicine.Id, medicine.Name, UnitPrice: 13m), CancellationToken.None);

        _db.MedicinePriceHistories.Count(h => h.Status == MedicinePriceHistoryStatus.Superseded).ShouldBe(1);
        _db.MedicinePriceHistories.Single(h => h.Status == MedicinePriceHistoryStatus.Active).UnitPrice.ShouldBe(13m);
    }

    [Fact]
    public async Task UpdateMedicine_Without_A_Price_Change_Should_Not_Touch_The_History()
    {
        var medicine = await SeedAsync(unitPrice: 10m, costPrice: 6m);

        await UpdateHandler().Handle(
            new UpdateMedicineCommand(medicine.Id, "Renamed", UnitPrice: 10m, CostPrice: 6m), CancellationToken.None);

        _db.MedicinePriceHistories.ShouldBeEmpty();
    }

    [Fact]
    public async Task Schedule_For_Today_Should_Apply_The_Price_To_The_Medicine()
    {
        var medicine = await SeedAsync(unitPrice: 10m, costPrice: 6m);

        await new CreateMedicinePriceScheduleCommandHandler(_db).Handle(
            new CreateMedicinePriceScheduleCommand(medicine.Id, 15m, DateOnly.FromDateTime(DateTime.UtcNow), 8m, "New MRP"),
            CancellationToken.None);

        var stored = await _db.Medicines.FindAsync(medicine.Id);
        stored!.UnitPrice.ShouldBe(15m);
        stored.CostPrice.ShouldBe(8m);
        _db.MedicinePriceHistories.ShouldHaveSingleItem().Status.ShouldBe(MedicinePriceHistoryStatus.Active);
    }

    private UpdateMedicineCommandHandler UpdateHandler()
    {
        var branch = Substitute.For<ICurrentBranch>();
        branch.RequireBranchIdAsync(Arg.Any<CancellationToken>()).Returns(Guid.CreateVersion7());
        return new UpdateMedicineCommandHandler(
            _db, new StockReceiptService(_db, branch), branch, Substitute.For<IOutboxWriter>(), Substitute.For<ICurrentUser>());
    }

    private async Task<Medicine> SeedAsync(decimal unitPrice, decimal costPrice)
    {
        var medicine = Medicine.Create("Cetamol", null, null, reorderLevel: 0, isControlled: false, unitPrice: unitPrice, costPrice: costPrice);
        _db.Medicines.Add(medicine);
        await _db.SaveChangesAsync();
        return medicine;
    }

    public void Dispose() => _db.Dispose();
}

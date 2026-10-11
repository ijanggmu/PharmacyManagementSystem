using FSH.Framework.Core.Exceptions;
using FSH.Modules.Inventory.Contracts.v1.Medicines;
using FSH.Modules.Inventory.Data;
using FSH.Modules.Inventory.Domain;
using FSH.Modules.Inventory.Features.v1.Medicines.PriceHistory;
using FSH.Modules.Inventory.Services;

namespace Inventory.Tests.Features;

public sealed class CreateMedicinePriceScheduleCommandHandlerTests
{
    private static readonly DateOnly Today = NepalClock.Today();

    private static async Task<(InventoryDbContext Db, Guid MedicineId)> SeedMedicineAsync()
    {
        var db = InventoryDbContextFactory.Create();
        var medicine = Medicine.Create("Paracetamol", null, null, 0m);
        db.Medicines.Add(medicine);
        await db.SaveChangesAsync();
        return (db, medicine.Id);
    }

    [Fact]
    public async Task Handle_Should_Throw_When_MedicineNotFound()
    {
        using var db = InventoryDbContextFactory.Create();
        var handler = new CreateMedicinePriceScheduleCommandHandler(db);

        await Should.ThrowAsync<NotFoundException>(() =>
            handler.Handle(
                new CreateMedicinePriceScheduleCommand(Guid.CreateVersion7(), 10m, Today), CancellationToken.None)
                .AsTask());
    }

    [Fact]
    public async Task Handle_Should_Throw_When_EffectiveFromIsInThePast()
    {
        var (db, medicineId) = await SeedMedicineAsync();
        using var _ = db;
        var handler = new CreateMedicinePriceScheduleCommandHandler(db);

        await Should.ThrowAsync<CustomException>(() =>
            handler.Handle(
                new CreateMedicinePriceScheduleCommand(medicineId, 10m, Today.AddDays(-1)), CancellationToken.None)
                .AsTask());
    }

    [Fact]
    public async Task Handle_Should_CreateActiveRow_When_EffectiveToday()
    {
        var (db, medicineId) = await SeedMedicineAsync();
        using var _ = db;
        var handler = new CreateMedicinePriceScheduleCommandHandler(db);

        var id = await handler.Handle(
            new CreateMedicinePriceScheduleCommand(medicineId, 100m, Today, 60m, "initial price"), CancellationToken.None);

        var row = db.MedicinePriceHistories.Single(h => h.Id == id);
        row.Status.ShouldBe(MedicinePriceHistoryStatus.Active);
        row.UnitPrice.ShouldBe(100m);
    }

    [Fact]
    public async Task Handle_Should_SupersedeExistingActiveRow_When_ImmediateChange()
    {
        var (db, medicineId) = await SeedMedicineAsync();
        using var _ = db;
        var handler = new CreateMedicinePriceScheduleCommandHandler(db);

        var firstId = await handler.Handle(
            new CreateMedicinePriceScheduleCommand(medicineId, 100m, Today), CancellationToken.None);
        await handler.Handle(new CreateMedicinePriceScheduleCommand(medicineId, 120m, Today), CancellationToken.None);

        var first = db.MedicinePriceHistories.Single(h => h.Id == firstId);
        first.Status.ShouldBe(MedicinePriceHistoryStatus.Superseded);

        db.MedicinePriceHistories.Count(h => h.MedicineId == medicineId && h.Status == MedicinePriceHistoryStatus.Active)
            .ShouldBe(1);
    }

    [Fact]
    public async Task Handle_Should_CreateScheduledRow_When_EffectiveFromIsFuture()
    {
        var (db, medicineId) = await SeedMedicineAsync();
        using var _ = db;
        var handler = new CreateMedicinePriceScheduleCommandHandler(db);

        var id = await handler.Handle(
            new CreateMedicinePriceScheduleCommand(medicineId, 150m, Today.AddDays(10)), CancellationToken.None);

        var row = db.MedicinePriceHistories.Single(h => h.Id == id);
        row.Status.ShouldBe(MedicinePriceHistoryStatus.Scheduled);
    }

    [Fact]
    public async Task Handle_Should_CancelPreviousSchedule_When_NewFutureScheduleReplacesIt()
    {
        var (db, medicineId) = await SeedMedicineAsync();
        using var _ = db;
        var handler = new CreateMedicinePriceScheduleCommandHandler(db);

        var firstId = await handler.Handle(
            new CreateMedicinePriceScheduleCommand(medicineId, 150m, Today.AddDays(10)), CancellationToken.None);
        await handler.Handle(
            new CreateMedicinePriceScheduleCommand(medicineId, 170m, Today.AddDays(20)), CancellationToken.None);

        var first = db.MedicinePriceHistories.Single(h => h.Id == firstId);
        first.Status.ShouldBe(MedicinePriceHistoryStatus.Cancelled);

        db.MedicinePriceHistories.Count(h => h.MedicineId == medicineId && h.Status == MedicinePriceHistoryStatus.Scheduled)
            .ShouldBe(1);
    }
}

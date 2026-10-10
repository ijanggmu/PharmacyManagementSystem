using FSH.Framework.Core.Exceptions;
using FSH.Modules.Inventory.Contracts.v1.Medicines;
using FSH.Modules.Inventory.Domain;
using FSH.Modules.Inventory.Features.v1.Medicines.PriceHistory;

namespace Inventory.Tests.Features;

public sealed class CancelMedicinePriceScheduleCommandHandlerTests
{
    private static readonly DateOnly Today = DateOnly.FromDateTime(DateTime.UtcNow);

    [Fact]
    public async Task Handle_Should_CancelPendingSchedule()
    {
        using var db = InventoryDbContextFactory.Create();
        var medicineId = Guid.CreateVersion7();
        var scheduled = MedicinePriceHistory.CreateScheduled(medicineId, 150m, null, Today.AddDays(5), null);
        db.MedicinePriceHistories.Add(scheduled);
        await db.SaveChangesAsync();

        var handler = new CancelMedicinePriceScheduleCommandHandler(db);
        await handler.Handle(new CancelMedicinePriceScheduleCommand(medicineId, scheduled.Id), CancellationToken.None);

        var row = db.MedicinePriceHistories.Single(h => h.Id == scheduled.Id);
        row.Status.ShouldBe(MedicinePriceHistoryStatus.Cancelled);
    }

    [Fact]
    public async Task Handle_Should_Throw_When_RowNotScheduled()
    {
        using var db = InventoryDbContextFactory.Create();
        var medicineId = Guid.CreateVersion7();
        var active = MedicinePriceHistory.CreateActive(medicineId, 100m, null, Today, null);
        db.MedicinePriceHistories.Add(active);
        await db.SaveChangesAsync();

        var handler = new CancelMedicinePriceScheduleCommandHandler(db);

        await Should.ThrowAsync<NotFoundException>(() =>
            handler.Handle(new CancelMedicinePriceScheduleCommand(medicineId, active.Id), CancellationToken.None).AsTask());
    }

    [Fact]
    public async Task Handle_Should_Throw_When_HistoryIdNotFound()
    {
        using var db = InventoryDbContextFactory.Create();
        var handler = new CancelMedicinePriceScheduleCommandHandler(db);

        await Should.ThrowAsync<NotFoundException>(() =>
            handler.Handle(
                new CancelMedicinePriceScheduleCommand(Guid.CreateVersion7(), Guid.CreateVersion7()), CancellationToken.None)
                .AsTask());
    }
}

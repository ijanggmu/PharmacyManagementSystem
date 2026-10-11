using FSH.Modules.Inventory.Contracts.v1.Medicines;
using FSH.Modules.Inventory.Domain;
using FSH.Modules.Inventory.Features.v1.Medicines.PriceHistory;

namespace Inventory.Tests.Features;

public sealed class GetMedicinePriceHistoryQueryHandlerTests
{
    private static readonly DateOnly Today = DateOnly.FromDateTime(DateTime.UtcNow);

    [Fact]
    public async Task Handle_Should_ExcludeCancelledRows_And_OrderNewestFirst()
    {
        using var db = InventoryDbContextFactory.Create();
        var medicineId = Guid.CreateVersion7();

        var older = MedicinePriceHistory.CreateActive(medicineId, 80m, null, Today.AddDays(-60), null);
        older.Supersede(Today.AddDays(-30));
        var newer = MedicinePriceHistory.CreateActive(medicineId, 100m, null, Today.AddDays(-30), null);
        var cancelled = MedicinePriceHistory.CreateScheduled(medicineId, 999m, null, Today.AddDays(5), null);
        cancelled.Cancel();

        db.MedicinePriceHistories.AddRange(older, newer, cancelled);
        await db.SaveChangesAsync();

        var handler = new GetMedicinePriceHistoryQueryHandler(db);
        var result = await handler.Handle(new GetMedicinePriceHistoryQuery(medicineId), CancellationToken.None);

        result.Count.ShouldBe(2);
        result[0].UnitPrice.ShouldBe(100m);
        result[1].UnitPrice.ShouldBe(80m);
    }

    [Fact]
    public async Task Handle_Should_ReturnEmpty_When_NoHistoryForMedicine()
    {
        using var db = InventoryDbContextFactory.Create();
        var handler = new GetMedicinePriceHistoryQueryHandler(db);

        var result = await handler.Handle(new GetMedicinePriceHistoryQuery(Guid.CreateVersion7()), CancellationToken.None);

        result.ShouldBeEmpty();
    }
}

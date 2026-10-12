using FSH.Modules.Inventory.Domain;
using FSH.Modules.Inventory.Jobs;
using Microsoft.Extensions.Logging.Abstractions;

namespace Inventory.Tests.Features;

public sealed class ActivateScheduledPricesJobTests
{
    [Fact]
    public async Task RunAsync_Should_Apply_A_Due_Schedule_And_Move_Batches_Still_At_The_Old_Price()
    {
        using var db = InventoryDbContextFactory.Create();
        var medicine = Medicine.Create("Paracetamol", null, null, 0m);
        medicine.ChangePrices(10m, 5m);
        db.Medicines.Add(medicine);

        var branchId = Guid.CreateVersion7();
        var expiry = DateOnly.FromDateTime(DateTime.UtcNow.AddYears(1));
        var following = MedicineBatch.Create(medicine.Id, branchId, "FOLLOWS", expiry, 10m, 5m, 10m, null);
        var ownPrice = MedicineBatch.Create(medicine.Id, branchId, "OWN-MRP", expiry, 10m, 5m, 11m, null);
        db.MedicineBatches.AddRange(following, ownPrice);

        var today = ActivateScheduledPricesJob.NepalToday(DateTime.UtcNow);
        db.MedicinePriceHistories.Add(MedicinePriceHistory.CreateActive(medicine.Id, 10m, 5m, today.AddDays(-30), "old"));
        var due = MedicinePriceHistory.CreateScheduled(medicine.Id, 12m, 6m, today, "new MRP");
        var future = MedicinePriceHistory.CreateScheduled(medicine.Id, 15m, null, today.AddDays(5), "later");
        db.MedicinePriceHistories.AddRange(due, future);
        await db.SaveChangesAsync();

        await new ActivateScheduledPricesJob(db, NullLogger<ActivateScheduledPricesJob>.Instance).RunAsync(CancellationToken.None);

        db.Medicines.Single().UnitPrice.ShouldBe(12m);
        db.MedicinePriceHistories.Single(h => h.Id == due.Id).Status.ShouldBe(MedicinePriceHistoryStatus.Active);
        db.MedicinePriceHistories.Single(h => h.Id == future.Id).Status.ShouldBe(MedicinePriceHistoryStatus.Scheduled);
        db.MedicinePriceHistories.Count(h => h.Status == MedicinePriceHistoryStatus.Superseded).ShouldBe(1);
        db.MedicineBatches.Single(b => b.Id == following.Id).SellingPrice.ShouldBe(12m);
        db.MedicineBatches.Single(b => b.Id == ownPrice.Id).SellingPrice.ShouldBe(11m);
    }
}

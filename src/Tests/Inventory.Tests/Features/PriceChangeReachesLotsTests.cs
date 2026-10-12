using FSH.Framework.Core.Context;
using FSH.Framework.Eventing.Abstractions;
using FSH.Modules.Inventory.Contracts.v1.Medicines;
using FSH.Modules.Inventory.Data;
using FSH.Modules.Inventory.Domain;
using FSH.Modules.Inventory.Features.v1.Medicines.PriceHistory;
using FSH.Modules.Inventory.Features.v1.Medicines.UpdateMedicine;
using FSH.Modules.Inventory.Jobs;
using FSH.Modules.Inventory.Services;
using FSH.Modules.Multitenancy.Contracts;
using Microsoft.Extensions.Logging.Abstractions;
using NSubstitute;

namespace Inventory.Tests.Features;

/// <summary>
/// The till charges a lot's selling price when it is above zero, so a price change that takes effect
/// must re-price the medicine's live lots — from the form, a schedule for today, or the daily job that
/// applies a scheduled change on its date.
/// </summary>
public sealed class PriceChangeReachesLotsTests : IDisposable
{
    private readonly InventoryDbContext _db = InventoryDbContextFactory.Create();
    private readonly DateOnly _today = NepalClock.Today();

    private async Task<(Medicine Medicine, MedicineBatch Live, MedicineBatch SoldOut, MedicineBatch Disposed)> SeedAsync()
    {
        var medicine = Medicine.Create("Cetamol", null, null, reorderLevel: 0, unitPrice: 10m, costPrice: 6m);
        _db.Medicines.Add(medicine);
        var branch = Guid.CreateVersion7();
        var live = MedicineBatch.Create(medicine.Id, branch, "LIVE", _today.AddMonths(6), 10m, 6m, 10m, null);
        var soldOut = MedicineBatch.Create(medicine.Id, branch, "EMPTY", _today.AddMonths(6), 0m, 6m, 10m, null);
        var disposed = MedicineBatch.Create(medicine.Id, branch, "GONE", _today.AddMonths(6), 5m, 6m, 10m, null);
        disposed.WriteOff();
        _db.MedicineBatches.AddRange(live, soldOut, disposed);
        await _db.SaveChangesAsync();
        return (medicine, live, soldOut, disposed);
    }

    private decimal SellingPriceOf(MedicineBatch batch) => _db.MedicineBatches.Single(b => b.Id == batch.Id).SellingPrice;

    [Fact]
    public async Task UpdateMedicine_With_New_Price_Should_Reprice_Every_Lot_Not_Disposed()
    {
        var (medicine, live, soldOut, disposed) = await SeedAsync();
        var branch = Substitute.For<ICurrentBranch>();
        var sut = new UpdateMedicineCommandHandler(
            _db, new StockReceiptService(_db, branch), branch, Substitute.For<IOutboxWriter>(), Substitute.For<ICurrentUser>());

        await sut.Handle(new UpdateMedicineCommand(medicine.Id, medicine.Name, UnitPrice: 12m), CancellationToken.None);

        SellingPriceOf(live).ShouldBe(12m);
        // An empty lot can take stock back (return, cancelled sale, transfer) and must then sell at today's price.
        SellingPriceOf(soldOut).ShouldBe(12m);
        SellingPriceOf(disposed).ShouldBe(10m);
    }

    [Fact]
    public async Task Schedule_For_Today_Should_Reprice_Live_Lots()
    {
        var (medicine, live, _, _) = await SeedAsync();

        await new CreateMedicinePriceScheduleCommandHandler(_db).Handle(
            new CreateMedicinePriceScheduleCommand(medicine.Id, 15m, _today, 8m, "New MRP"), CancellationToken.None);

        SellingPriceOf(live).ShouldBe(15m);
    }

    [Fact]
    public async Task Future_Schedule_Should_Not_Reprice_Lots_Until_Its_Date()
    {
        var (medicine, live, _, _) = await SeedAsync();

        await new CreateMedicinePriceScheduleCommandHandler(_db).Handle(
            new CreateMedicinePriceScheduleCommand(medicine.Id, 15m, _today.AddDays(3)), CancellationToken.None);

        SellingPriceOf(live).ShouldBe(10m);
        _db.Medicines.Single().UnitPrice.ShouldBe(10m);
    }

    [Fact]
    public async Task Daily_Job_Should_Apply_Due_Schedule_And_Leave_Future_Ones()
    {
        var (medicine, live, soldOut, disposed) = await SeedAsync();
        var other = Medicine.Create("Brufen", null, null, reorderLevel: 0, unitPrice: 20m, costPrice: 9m);
        _db.Medicines.Add(other);
        var active = MedicinePriceHistory.CreateActive(medicine.Id, 10m, 6m, _today.AddMonths(-1), "initial");
        var due = MedicinePriceHistory.CreateScheduled(medicine.Id, 11m, 7m, _today, "budget");
        var future = MedicinePriceHistory.CreateScheduled(other.Id, 25m, null, _today.AddDays(5), "later");
        _db.MedicinePriceHistories.AddRange(active, due, future);
        await _db.SaveChangesAsync();

        await ApplyDueMedicinePriceSchedulesJob.ApplyDueForCurrentTenantAsync(
            _db, _today, NullLogger.Instance, CancellationToken.None);

        _db.ChangeTracker.Clear();
        _db.Medicines.Single(m => m.Id == medicine.Id).UnitPrice.ShouldBe(11m);
        _db.Medicines.Single(m => m.Id == medicine.Id).CostPrice.ShouldBe(7m);
        SellingPriceOf(live).ShouldBe(11m);
        SellingPriceOf(soldOut).ShouldBe(11m);
        SellingPriceOf(disposed).ShouldBe(10m);

        var history = _db.MedicinePriceHistories.ToList();
        history.Single(h => h.Id == active.Id).Status.ShouldBe(MedicinePriceHistoryStatus.Superseded);
        history.Single(h => h.Id == active.Id).EffectiveTo.ShouldBe(_today);
        history.Single(h => h.Id == due.Id).Status.ShouldBe(MedicinePriceHistoryStatus.Active);
        history.Single(h => h.Id == future.Id).Status.ShouldBe(MedicinePriceHistoryStatus.Scheduled);
        _db.Medicines.Single(m => m.Id == other.Id).UnitPrice.ShouldBe(20m);
    }

    public void Dispose() => _db.Dispose();
}

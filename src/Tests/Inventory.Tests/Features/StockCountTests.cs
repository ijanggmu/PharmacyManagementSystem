using FSH.Framework.Core.Context;
using FSH.Framework.Core.Exceptions;
using FSH.Framework.Eventing.Abstractions;
using FSH.Modules.Inventory.Contracts.Events;
using FSH.Modules.Inventory.Contracts.v1.StockCounts;
using FSH.Modules.Inventory.Data;
using FSH.Modules.Inventory.Domain;
using FSH.Modules.Inventory.Features.v1.StockCounts.ChangeStockCountStatus;
using FSH.Modules.Inventory.Features.v1.StockCounts.CreateStockCountSession;
using FSH.Modules.Inventory.Features.v1.StockCounts.GetStockCountSessionById;
using FSH.Modules.Inventory.Features.v1.StockCounts.PostStockCountSession;
using FSH.Modules.Inventory.Features.v1.StockCounts.RecordStockCounts;
using FSH.Modules.Inventory.Features.v1.StockCounts.StartStockCountSession;
using FSH.Modules.Inventory.Services;
using FSH.Modules.Multitenancy.Contracts;
using NSubstitute;

namespace Inventory.Tests.Features;

/// <summary>Physical stock count: snapshot, count while the shop trades, review, post through the adjustment path.</summary>
public sealed class StockCountTests : IDisposable
{
    private static readonly DateTime T0 = new(2026, 10, 1, 4, 0, 0, DateTimeKind.Utc);

    private readonly InventoryDbContext _db = InventoryDbContextFactory.Create();
    private readonly ManualClock _clock = new(T0);
    private readonly Guid _branchId = Guid.CreateVersion7();
    private readonly ICurrentBranch _branch;
    private readonly IOutboxWriter _outbox = Substitute.For<IOutboxWriter>();
    private readonly List<InventoryAdjustedIntegrationEvent> _events = [];
    private readonly Medicine _medicine;

    public StockCountTests()
    {
        _branch = Substitute.For<ICurrentBranch>();
        _branch.GetBranchIdAsync(Arg.Any<CancellationToken>()).Returns(_branchId);
        _branch.RequireBranchIdAsync(Arg.Any<CancellationToken>()).Returns(_branchId);
        _branch.CanViewAllBranchesAsync(Arg.Any<CancellationToken>()).Returns(false);
        _outbox.AddAsync(Arg.Do<IIntegrationEvent>(e =>
        {
            if (e is InventoryAdjustedIntegrationEvent adjusted)
            {
                _events.Add(adjusted);
            }
        }), Arg.Any<CancellationToken>()).Returns(Task.CompletedTask);

        _medicine = Medicine.Create("Paracetamol", null, null, reorderLevel: 5, costPrice: 4m, unitPrice: 6m);
        _db.Medicines.Add(_medicine);
        _db.SaveChanges();
    }

    public void Dispose() => _db.Dispose();

    #region Variance math

    [Fact]
    public void Variance_Should_Roll_Snapshot_Forward_By_Movements_Up_To_The_Count()
    {
        var lot = Guid.CreateVersion7();
        LotMovement[] movements =
        [
            new(lot, T0.AddMinutes(-5), -50m), // before the snapshot: already in it
            new(lot, T0.AddMinutes(1), -10m),  // sold before the shelf was counted
            new(lot, T0.AddMinutes(3), -5m),   // sold after the count
        ];

        decimal expected = StockCountVariance.ExpectedAtCount(100m, T0, T0.AddMinutes(2), movements);
        decimal variance = StockCountVariance.Variance(88m, expected);

        expected.ShouldBe(90m);
        variance.ShouldBe(-2m);
        StockCountVariance.QuantityAfterPosting(liveQuantity: 85m, variance).ShouldBe(83m);
    }

    [Fact]
    public void QuantityAfterPosting_Should_Never_Go_Below_Zero()
    {
        StockCountVariance.QuantityAfterPosting(liveQuantity: 1m, variance: -3m).ShouldBe(0m);
    }

    #endregion

    #region Session flow

    [Fact]
    public async Task Post_Should_Book_Only_The_Real_Loss_When_Sales_Happen_During_The_Count()
    {
        var batch = SeedLot("B1", 100m, cost: 3m, rack: "A1");
        Guid sessionId = await CreateAndStartAsync();

        // Sold 10 before the shelf was counted…
        Sell(batch, 10m, T0.AddMinutes(1));
        _clock.Now = T0.AddMinutes(2);
        var line = _db.StockCountLines.Single();
        await RecordAsync(sessionId, new StockCountEntryInput(line.Id, 88m));
        // …and 5 more after.
        Sell(batch, 5m, T0.AddMinutes(3));

        var detail = await GetAsync(sessionId);
        var row = detail.Lines.ShouldHaveSingleItem();
        row.ExpectedQuantity.ShouldBe(90m);
        row.VarianceQuantity.ShouldBe(-2m);
        row.VarianceValue.ShouldBe(-6m);

        await SubmitAsync(sessionId);
        var posted = await PostAsync(sessionId);

        posted.Status.ShouldBe("Posted");
        posted.PostedLossValue.ShouldBe(6m);
        _db.MedicineBatches.Single().QuantityOnHand.ShouldBe(83m);
        var adjustment = _db.InventoryTransactions.Single(t => t.Type == InventoryTransactionType.Adjustment);
        adjustment.QuantityDelta.ShouldBe(-2m);
        adjustment.ReferenceType.ShouldBe(PostStockCountSessionCommandHandler.ReferenceType);
        adjustment.ReferenceId.ShouldBe(sessionId);
        _events.ShouldHaveSingleItem().ValueChange.ShouldBe(-6m);
    }

    [Fact]
    public async Task Post_Should_Post_Gains_And_Losses_Separately_And_Leave_Uncounted_Lots_Alone()
    {
        var a = SeedLot("A", 10m, cost: 2m);
        var b = SeedLot("B", 10m, cost: 5m);
        var c = SeedLot("C", 10m, cost: 1m);
        Guid sessionId = await CreateAndStartAsync();
        var lines = _db.StockCountLines.ToList();

        await RecordAsync(sessionId,
            new StockCountEntryInput(lines.Single(l => l.BatchId == a.Id).Id, 12m),
            new StockCountEntryInput(lines.Single(l => l.BatchId == b.Id).Id, 7m));
        await SubmitAsync(sessionId);
        var posted = await PostAsync(sessionId);

        posted.PostedGainValue.ShouldBe(4m);
        posted.PostedLossValue.ShouldBe(15m);
        _events.Select(e => e.ValueChange).OrderBy(v => v).ShouldBe([-15m, 4m]);
        _db.MedicineBatches.Single(x => x.Id == a.Id).QuantityOnHand.ShouldBe(12m);
        _db.MedicineBatches.Single(x => x.Id == b.Id).QuantityOnHand.ShouldBe(7m);
        _db.MedicineBatches.Single(x => x.Id == c.Id).QuantityOnHand.ShouldBe(10m);
    }

    [Fact]
    public async Task Post_Should_Create_A_Found_Lot_The_System_Did_Not_Know()
    {
        SeedLot("KNOWN", 5m, cost: 3m);
        Guid sessionId = await CreateAndStartAsync();

        await RecordAsync(sessionId, new StockCountEntryInput(
            LineId: null, CountedQuantity: 7m, MedicineId: _medicine.Id, BatchNo: "found 1", ExpiryDate: new DateOnly(2027, 6, 30)));
        await SubmitAsync(sessionId);
        await PostAsync(sessionId);

        // Valued at the medicine's latest lot (cost 3, sells at 6), not its never-updated cost price of 4.
        var found = _db.MedicineBatches.Single(x => x.BatchNo == "FOUND 1");
        found.QuantityOnHand.ShouldBe(7m);
        found.CostPrice.ShouldBe(3m);
        found.SellingPrice.ShouldBe(6m);
        _events.ShouldHaveSingleItem().ValueChange.ShouldBe(21m);
    }

    [Fact]
    public async Task Post_Should_Cost_A_Found_Lot_At_The_Latest_Lot_Not_Zero()
    {
        // The medicine was created with no cost or price; purchases since put a lot at 8.50 / 12.
        var bare = Medicine.Create("Cetirizine", null, null, reorderLevel: 0);
        _db.Medicines.Add(bare);
        _db.MedicineBatches.Add(MedicineBatch.Create(bare.Id, Guid.CreateVersion7(), "OLDER", new DateOnly(2027, 1, 31), 0m, 5m, 7m, null));
        await _db.SaveChangesAsync();
        _clock.Now = T0.AddMinutes(1);
        _db.MedicineBatches.Add(MedicineBatch.Create(bare.Id, Guid.CreateVersion7(), "LATEST", new DateOnly(2027, 1, 31), 0m, 8.5m, 12m, null));
        await _db.SaveChangesAsync();
        Guid sessionId = await CreateAndStartAsync();

        await RecordAsync(sessionId, new StockCountEntryInput(
            LineId: null, CountedQuantity: 2m, MedicineId: bare.Id, BatchNo: "found 2", ExpiryDate: new DateOnly(2027, 6, 30)));
        await SubmitAsync(sessionId);
        await PostAsync(sessionId);

        var found = _db.MedicineBatches.Single(x => x.BatchNo == "FOUND 2");
        found.CostPrice.ShouldBeGreaterThan(0m);
        found.SellingPrice.ShouldBeGreaterThan(0m);
        _events.ShouldHaveSingleItem().ValueChange.ShouldBe(2m * found.CostPrice);
    }

    [Fact]
    public async Task Post_Of_Consigned_Lot_Should_Move_Stock_But_Post_Nothing()
    {
        var batch = SeedLot("CONS", 10m, cost: 3m);
        _db.ConsignmentPositions.Add(ConsignmentPosition.Create(
            Guid.CreateVersion7(), batch.MedicineId, batch.Id, batch.BatchNo, 10m, 3m, T0, _branchId));
        await _db.SaveChangesAsync();
        Guid sessionId = await CreateAndStartAsync();

        await RecordAsync(sessionId, new StockCountEntryInput(_db.StockCountLines.Single().Id, 8m));
        await SubmitAsync(sessionId);
        await PostAsync(sessionId);

        _db.MedicineBatches.Single().QuantityOnHand.ShouldBe(8m);
        _events.ShouldBeEmpty();
    }

    [Fact]
    public async Task Start_Should_Snapshot_Only_The_Scoped_Rack()
    {
        SeedLot("R1", 5m, cost: 1m, rack: "A1");
        SeedLot("R2", 5m, cost: 1m, rack: "B2");
        Guid sessionId = await new CreateStockCountSessionCommandHandler(_db, _branch, _clock)
            .Handle(new CreateStockCountSessionCommand(RackLocation: "a1"), CancellationToken.None);
        await new StartStockCountSessionCommandHandler(_db, _branch, _clock)
            .Handle(new StartStockCountSessionCommand(sessionId), CancellationToken.None);

        _db.StockCountLines.ShouldHaveSingleItem().BatchNo.ShouldBe("R1");
    }

    [Fact]
    public async Task Start_Should_Refuse_Lots_Already_In_Another_Open_Count()
    {
        SeedLot("X", 5m, cost: 1m);
        await CreateAndStartAsync();

        Guid second = await new CreateStockCountSessionCommandHandler(_db, _branch, _clock)
            .Handle(new CreateStockCountSessionCommand(), CancellationToken.None);
        var ex = await Should.ThrowAsync<CustomException>(() => new StartStockCountSessionCommandHandler(_db, _branch, _clock)
            .Handle(new StartStockCountSessionCommand(second), CancellationToken.None).AsTask());
        ex.StatusCode.ShouldBe(System.Net.HttpStatusCode.Conflict);
    }

    [Fact]
    public async Task Post_Should_Require_Review()
    {
        SeedLot("Y", 5m, cost: 1m);
        Guid sessionId = await CreateAndStartAsync();

        await Should.ThrowAsync<CustomException>(() => PostAsync(sessionId));
        _db.MedicineBatches.Single().QuantityOnHand.ShouldBe(5m);
    }

    [Fact]
    public async Task Record_Should_Be_Refused_After_Submission()
    {
        SeedLot("Z", 5m, cost: 1m);
        Guid sessionId = await CreateAndStartAsync();
        await SubmitAsync(sessionId);

        await Should.ThrowAsync<CustomException>(() =>
            RecordAsync(sessionId, new StockCountEntryInput(_db.StockCountLines.Single().Id, 1m)));
    }

    #endregion

    private MedicineBatch SeedLot(string batchNo, decimal quantity, decimal cost, string? rack = null)
    {
        var batch = MedicineBatch.Create(_medicine.Id, _branchId, batchNo, new DateOnly(2027, 1, 31), quantity, cost, cost * 2, rack);
        _db.MedicineBatches.Add(batch);
        _db.SaveChanges();
        return batch;
    }

    /// <summary>A till sale of <paramref name="quantity"/> from the lot, recorded at <paramref name="atUtc"/>.</summary>
    private void Sell(MedicineBatch batch, decimal quantity, DateTime atUtc)
    {
        var tracked = _db.MedicineBatches.Single(b => b.Id == batch.Id);
        tracked.Deduct(quantity);
        var sale = InventoryTransaction.Create(
            batch.MedicineId, batch.BranchId, batch.Id, InventoryTransactionType.Sale, -quantity, batch.CostPrice, "Sale", Guid.CreateVersion7());
        _db.InventoryTransactions.Add(sale);
        _db.Entry(sale).Property(t => t.CreatedAtUtc).CurrentValue = atUtc;
        _db.SaveChanges();
    }

    private async Task<Guid> CreateAndStartAsync()
    {
        Guid id = await new CreateStockCountSessionCommandHandler(_db, _branch, _clock)
            .Handle(new CreateStockCountSessionCommand("Full count"), CancellationToken.None);
        await new StartStockCountSessionCommandHandler(_db, _branch, _clock)
            .Handle(new StartStockCountSessionCommand(id), CancellationToken.None);
        return id;
    }

    private async Task RecordAsync(Guid sessionId, params StockCountEntryInput[] entries) =>
        await new RecordStockCountsCommandHandler(_db, _branch, _clock)
            .Handle(new RecordStockCountsCommand(sessionId, entries), CancellationToken.None);

    private async Task SubmitAsync(Guid sessionId) =>
        await new ChangeStockCountStatusCommandHandler(_db, _branch, _clock)
            .Handle(new ChangeStockCountStatusCommand(sessionId, StockCountTransition.SubmitForReview), CancellationToken.None);

    private async Task<FSH.Modules.Inventory.Contracts.Dtos.StockCountSessionDto> PostAsync(Guid sessionId) =>
        await new PostStockCountSessionCommandHandler(_db, _outbox, Substitute.For<ICurrentUser>(), _branch, _clock)
            .Handle(new PostStockCountSessionCommand(sessionId), CancellationToken.None);

    private async Task<FSH.Modules.Inventory.Contracts.Dtos.StockCountSessionDetailDto> GetAsync(Guid sessionId) =>
        await new GetStockCountSessionByIdQueryHandler(_db, _branch, _clock)
            .Handle(new GetStockCountSessionByIdQuery(sessionId), CancellationToken.None);

    private sealed class ManualClock(DateTime now) : TimeProvider
    {
        public DateTime Now { get; set; } = now;

        public override DateTimeOffset GetUtcNow() => new(Now, TimeSpan.Zero);
    }
}

using FSH.Framework.Core.Context;
using FSH.Framework.Eventing.Abstractions;
using FSH.Modules.Inventory.Contracts.Events;
using FSH.Modules.Inventory.Contracts.v1.Batches;
using FSH.Modules.Inventory.Domain;
using FSH.Modules.Inventory.Features.v1.Batches.AdjustBatchQuantity;
using FSH.Modules.Inventory.Features.v1.Batches.DisposeBatch;
using NSubstitute;

namespace Inventory.Tests.Features;

public sealed class BatchAdjustmentPostingTests
{
    private static (FSH.Modules.Inventory.Data.InventoryDbContext Db, MedicineBatch Batch) Seed(decimal quantity, decimal cost)
    {
        var db = InventoryDbContextFactory.Create();
        var medicine = Medicine.Create("Paracetamol", null, null, reorderLevel: 5, isControlled: false);
        db.Medicines.Add(medicine);
        var batch = MedicineBatch.Create(
            medicine.Id, Guid.CreateVersion7(), "B1", DateOnly.FromDateTime(DateTime.UtcNow.AddYears(1)), quantity, cost, cost * 2, rackLocation: null);
        db.MedicineBatches.Add(batch);
        db.SaveChanges();
        return (db, batch);
    }

    private static List<InventoryAdjustedIntegrationEvent> Capture(IOutboxWriter outbox)
    {
        var events = new List<InventoryAdjustedIntegrationEvent>();
        outbox.AddAsync(Arg.Do<IIntegrationEvent>(e =>
        {
            if (e is InventoryAdjustedIntegrationEvent adjusted)
            {
                events.Add(adjusted);
            }
        }), Arg.Any<CancellationToken>()).Returns(Task.CompletedTask);
        return events;
    }

    [Fact]
    public async Task DisposeBatch_Should_PublishLossAtBatchCost()
    {
        var (db, batch) = Seed(quantity: 20m, cost: 3m);
        using var _ = db;
        var outbox = Substitute.For<IOutboxWriter>();
        var events = Capture(outbox);

        await new DisposeBatchCommandHandler(db, outbox, Substitute.For<ICurrentUser>())
            .Handle(new DisposeBatchCommand(batch.Id, "expired"), CancellationToken.None);

        var adjusted = events.ShouldHaveSingleItem();
        adjusted.ValueChange.ShouldBe(-60m);
        adjusted.BranchId.ShouldBe(batch.BranchId);
    }

    [Theory]
    [InlineData(15, -15)]
    [InlineData(25, 15)]
    public async Task AdjustBatchQuantity_Should_PublishSignedValueChange(decimal newQuantity, decimal expectedValue)
    {
        var (db, batch) = Seed(quantity: 20m, cost: 3m);
        using var _ = db;
        var outbox = Substitute.For<IOutboxWriter>();
        var events = Capture(outbox);

        await new AdjustBatchQuantityCommandHandler(db, outbox, Substitute.For<ICurrentUser>())
            .Handle(new AdjustBatchQuantityCommand(batch.Id, newQuantity, "stock count"), CancellationToken.None);

        events.ShouldHaveSingleItem().ValueChange.ShouldBe(expectedValue);
    }
}

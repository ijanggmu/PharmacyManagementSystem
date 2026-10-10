using FSH.Modules.Inventory.Contracts.v1.Batches;
using FSH.Modules.Inventory.Data;
using FSH.Modules.Inventory.Domain;
using FSH.Modules.Inventory.Features.v1.Batches.CreateBatch;
using FSH.Modules.Multitenancy.Contracts;
using NSubstitute;

namespace Inventory.Tests.Features;

public sealed class CreateBatchCommandHandlerTests : IDisposable
{
    private readonly InventoryDbContext _db = InventoryDbContextFactory.Create();

    private CreateBatchCommandHandler CreateSut(Guid branchId)
    {
        var currentBranch = Substitute.For<ICurrentBranch>();
        currentBranch.RequireBranchIdAsync(Arg.Any<CancellationToken>()).Returns(branchId);
        return new CreateBatchCommandHandler(
            _db, currentBranch,
            Substitute.For<FSH.Framework.Eventing.Abstractions.IOutboxWriter>(),
            Substitute.For<FSH.Framework.Core.Context.ICurrentUser>());
    }

    [Fact]
    public async Task Handle_Should_Stamp_Batch_And_Transaction_With_CurrentBranchId()
    {
        var medicine = Medicine.Create("Paracetamol", null, null, reorderLevel: 5, isControlled: false);
        _db.Medicines.Add(medicine);
        await _db.SaveChangesAsync(CancellationToken.None);

        var branchId = Guid.CreateVersion7();
        var sut = CreateSut(branchId);

        var command = new CreateBatchCommand(
            medicine.Id, "B001", DateOnly.FromDateTime(DateTime.UtcNow.AddYears(1)), 20m, 5m, 10m, "A1");

        var batchId = await sut.Handle(command, CancellationToken.None);

        var batch = _db.MedicineBatches.Single(b => b.Id == batchId);
        batch.BranchId.ShouldBe(branchId);

        var transaction = _db.InventoryTransactions.Single(t => t.MedicineBatchId == batchId);
        transaction.BranchId.ShouldBe(branchId);
    }

    public void Dispose() => _db.Dispose();
}

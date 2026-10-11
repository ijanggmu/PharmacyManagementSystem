using FSH.Modules.Inventory.Contracts.v1.Batches;
using FSH.Modules.Inventory.Contracts.v1.Consignment;
using FSH.Modules.Multitenancy.Contracts;
using FSH.Modules.Multitenancy.Contracts.Dtos;
using FSH.Modules.Multitenancy.Contracts.v1.GetBranchById;
using Mediator;
using FSH.Modules.Inventory.Contracts.v1.StockTransfers;
using FSH.Modules.Inventory.Contracts.v1.Transactions;
using FSH.Modules.Inventory.Data;
using FSH.Modules.Inventory.Domain;
using FSH.Modules.Inventory.Features.v1.Batches.SearchBatches;
using FSH.Modules.Inventory.Features.v1.Consignment.SearchConsignmentPositions;
using FSH.Modules.Inventory.Features.v1.StockTransfers.SearchStockTransfers;
using FSH.Modules.Inventory.Features.v1.Transactions.SearchInventoryTransactions;
using NSubstitute;

namespace Inventory.Tests.Features;

/// <summary>Optional branchId filter added to every Inventory search endpoint in the branch-scoping
/// wave (docs/branch-scoping-plan.md §5 step 3).</summary>
public sealed class BranchFilterQueryTests : IDisposable
{
    private readonly InventoryDbContext _db = InventoryDbContextFactory.Create();

    // Explicit-branchId tests: no tenant branch resolved, so the default never applies here.
    private readonly ICurrentBranch _currentBranch = NoCurrentBranch();

    private static IMediator BranchNameMediator()
    {
        var mediator = Substitute.For<IMediator>();
#pragma warning disable CA2012 // NSubstitute stores the ValueTask as a configured return value, not as a consumed one.
        mediator.Send(Arg.Any<GetBranchByIdQuery>(), Arg.Any<CancellationToken>())
            .Returns(_ => new ValueTask<BranchDto>(new BranchDto { Name = "Main", Code = "MAIN" }));
#pragma warning restore CA2012
        return mediator;
    }

    private static ICurrentBranch NoCurrentBranch()
    {
        var branch = Substitute.For<ICurrentBranch>();
        branch.ResolveListBranchFilterAsync(Arg.Any<Guid?>(), Arg.Any<CancellationToken>()).Returns(ci => ci.ArgAt<Guid?>(0));
        return branch;
    }

    [Fact]
    public async Task SearchBatches_Should_Filter_By_BranchId()
    {
        var branchA = Guid.CreateVersion7();
        var branchB = Guid.CreateVersion7();
        var medicine = Medicine.Create("Paracetamol", null, null, reorderLevel: 0);
        _db.Medicines.Add(medicine);

        _db.MedicineBatches.Add(MedicineBatch.Create(
            medicine.Id, branchA, "A1", DateOnly.FromDateTime(DateTime.UtcNow.AddYears(1)), 10m, 1m, 2m, null));
        _db.MedicineBatches.Add(MedicineBatch.Create(
            medicine.Id, branchB, "B1", DateOnly.FromDateTime(DateTime.UtcNow.AddYears(1)), 20m, 1m, 2m, null));
        await _db.SaveChangesAsync(CancellationToken.None);

        var handler = new SearchBatchesQueryHandler(_db, _currentBranch, BranchNameMediator());
        var result = await handler.Handle(new SearchBatchesQuery(BranchId: branchA), CancellationToken.None);

        result.Items.ShouldHaveSingleItem().BatchNo.ShouldBe("A1");
    }

    [Fact]
    public async Task SearchInventoryTransactions_Should_Filter_By_BranchId()
    {
        var branchA = Guid.CreateVersion7();
        var branchB = Guid.CreateVersion7();
        var medicineId = Guid.CreateVersion7();

        _db.InventoryTransactions.Add(InventoryTransaction.Create(
            medicineId, branchA, null, InventoryTransactionType.Adjustment, 5m, 1m));
        _db.InventoryTransactions.Add(InventoryTransaction.Create(
            medicineId, branchB, null, InventoryTransactionType.Adjustment, 7m, 1m));
        await _db.SaveChangesAsync(CancellationToken.None);

        var handler = new SearchInventoryTransactionsQueryHandler(_db, _currentBranch);
        var result = await handler.Handle(new SearchInventoryTransactionsQuery(BranchId: branchA), CancellationToken.None);

        result.Items.ShouldHaveSingleItem().QuantityDelta.ShouldBe(5m);
    }

    [Fact]
    public async Task SearchStockTransfers_Should_Filter_By_BranchId_Matching_From_Or_To()
    {
        var branchA = Guid.CreateVersion7();
        var branchB = Guid.CreateVersion7();
        var branchC = Guid.CreateVersion7();
        var medicineId = Guid.CreateVersion7();

        var transferInvolvingA = StockTransfer.Create(
            branchA, branchB, Guid.CreateVersion7(), null,
            [(medicineId, 5m)]);
        var transferNotInvolvingA = StockTransfer.Create(
            branchB, branchC, Guid.CreateVersion7(), null,
            [(medicineId, 5m)]);
        _db.StockTransfers.Add(transferInvolvingA);
        _db.StockTransfers.Add(transferNotInvolvingA);
        await _db.SaveChangesAsync(CancellationToken.None);

        var handler = new SearchStockTransfersQueryHandler(_db, _currentBranch);
        var result = await handler.Handle(new SearchStockTransfersQuery(BranchId: branchA), CancellationToken.None);

        result.Items.ShouldHaveSingleItem().Id.ShouldBe(transferInvolvingA.Id);
    }

    [Fact]
    public async Task SearchConsignmentPositions_Should_Filter_By_BranchId()
    {
        var branchA = Guid.CreateVersion7();
        var supplierId = Guid.CreateVersion7();

        var batchA = MedicineBatch.Create(
            Guid.CreateVersion7(), branchA, "CA1", DateOnly.FromDateTime(DateTime.UtcNow.AddYears(1)), 10m, 1m, 2m, null);
        _db.MedicineBatches.Add(batchA);

        var positionWithBranch = ConsignmentPosition.Create(
            supplierId, batchA.MedicineId, batchA.Id, batchA.BatchNo, 10m, 1m, DateTime.UtcNow, branchA);
        var positionWithoutBranch = ConsignmentPosition.Create(
            supplierId, batchA.MedicineId, batchA.Id, "CA2", 10m, 1m, DateTime.UtcNow, branchId: null);
        _db.ConsignmentPositions.Add(positionWithBranch);
        _db.ConsignmentPositions.Add(positionWithoutBranch);
        await _db.SaveChangesAsync(CancellationToken.None);

        var handler = new SearchConsignmentPositionsQueryHandler(_db, _currentBranch);
        var result = await handler.Handle(new SearchConsignmentPositionsQuery(BranchId: branchA), CancellationToken.None);

        result.Items.ShouldHaveSingleItem().Id.ShouldBe(positionWithBranch.Id);
    }

    public void Dispose() => _db.Dispose();
}

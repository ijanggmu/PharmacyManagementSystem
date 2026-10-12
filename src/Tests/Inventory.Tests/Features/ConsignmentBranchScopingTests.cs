using FSH.Framework.Core.Context;
using FSH.Framework.Eventing.Abstractions;
using FSH.Modules.Inventory.Contracts.Services;
using FSH.Modules.Inventory.Contracts.v1.Consignment;
using FSH.Modules.Inventory.Data;
using FSH.Modules.Inventory.Features.v1.Consignment.ReceiveConsignmentStock;
using FSH.Modules.Inventory.Features.v1.Consignment.SettleConsignment;
using FSH.Modules.Inventory.Services;
using FSH.Modules.Multitenancy.Contracts;
using NSubstitute;

namespace Inventory.Tests.Features;

/// <summary>
/// ConsignmentPosition/ConsignmentSettlement are ledger/reporting entities — BranchId is nullable,
/// sourced via <see cref="ICurrentBranch.GetBranchIdAsync"/> (docs/branch-scoping-plan.md), unlike
/// the required BranchId on MedicineBatch/InventoryTransaction/StockTransfer.
/// </summary>
public sealed class ConsignmentBranchScopingTests : IDisposable
{
    private readonly InventoryDbContext _db = InventoryDbContextFactory.Create();

    [Fact]
    public async Task ReceiveConsignmentStock_Should_Persist_BranchId_From_CurrentBranch()
    {
        var branchId = Guid.CreateVersion7();
        var currentBranch = Substitute.For<ICurrentBranch>();
        currentBranch.GetBranchIdAsync(Arg.Any<CancellationToken>()).Returns(branchId);
        // The underlying StockReceiptService requires a branch to create the batch.
        currentBranch.RequireBranchIdAsync(Arg.Any<CancellationToken>()).Returns(branchId);

        var handler = new ReceiveConsignmentStockCommandHandler(
            _db, new StockReceiptService(_db, currentBranch), currentBranch);

        var command = new ReceiveConsignmentStockCommand(
            Guid.CreateVersion7(), Guid.CreateVersion7(), "C-BATCH",
            DateOnly.FromDateTime(DateTime.UtcNow.AddYears(1)), 100m, 5m, 8m);

        var positionId = await handler.Handle(command, CancellationToken.None);

        var position = _db.ConsignmentPositions.Single(p => p.Id == positionId);
        position.BranchId.ShouldBe(branchId);
    }

    [Fact]
    public async Task ReceiveConsignmentStock_Should_Persist_NullBranchId_When_NoBranchResolved()
    {
        var currentBranch = Substitute.For<ICurrentBranch>();
        currentBranch.GetBranchIdAsync(Arg.Any<CancellationToken>()).Returns((Guid?)null);
        currentBranch.RequireBranchIdAsync(Arg.Any<CancellationToken>()).Returns(Guid.CreateVersion7());

        var handler = new ReceiveConsignmentStockCommandHandler(
            _db, new StockReceiptService(_db, currentBranch), currentBranch);

        var command = new ReceiveConsignmentStockCommand(
            Guid.CreateVersion7(), Guid.CreateVersion7(), "C-BATCH-2",
            DateOnly.FromDateTime(DateTime.UtcNow.AddYears(1)), 50m, 5m, 8m);

        var positionId = await handler.Handle(command, CancellationToken.None);

        var position = _db.ConsignmentPositions.Single(p => p.Id == positionId);
        position.BranchId.ShouldBeNull();
    }

    [Fact]
    public async Task SettleConsignment_Should_Persist_BranchId_From_CurrentBranch()
    {
        var branchId = Guid.CreateVersion7();
        var supplierId = Guid.CreateVersion7();

        var currentBranch = Substitute.For<ICurrentBranch>();
        currentBranch.GetBranchIdAsync(Arg.Any<CancellationToken>()).Returns(branchId);
        currentBranch.RequireBranchIdAsync(Arg.Any<CancellationToken>()).Returns(branchId);

        var stockReceiptService = new StockReceiptService(_db, currentBranch);
        var receiveHandler = new ReceiveConsignmentStockCommandHandler(_db, stockReceiptService, currentBranch);
        await receiveHandler.Handle(
            new ReceiveConsignmentStockCommand(
                supplierId, Guid.CreateVersion7(), "SETTLE-BATCH",
                DateOnly.FromDateTime(DateTime.UtcNow.AddYears(1)), 100m, 5m, 8m),
            CancellationToken.None);

        // 40 units sold since receipt; another 30 expire and are written off, which the supplier is not owed.
        var batch = _db.MedicineBatches.Single();
        await new StockDeductionService(_db, currentBranch).DeductForSaleAsync(
            new StockDeductionRequest("Sale", Guid.CreateVersion7(), [new StockDeductionLine(batch.MedicineId, 40m)]));
        batch.Deduct(30m);
        await _db.SaveChangesAsync(CancellationToken.None);

        var currentUser = Substitute.For<ICurrentUser>();
        currentUser.Name.Returns("tester");
        var outbox = Substitute.For<IOutboxWriter>();

        var settleHandler = new SettleConsignmentCommandHandler(_db, outbox, currentUser, currentBranch);
        var settlementId = await settleHandler.Handle(new SettleConsignmentCommand(supplierId), CancellationToken.None);

        var settlement = _db.ConsignmentSettlements.Single(s => s.Id == settlementId);
        settlement.BranchId.ShouldBe(branchId);
        // Billed for the 40 sold at cost 5, not for the 30 written off.
        settlement.TotalAmount.ShouldBe(200m);
    }

    public void Dispose() => _db.Dispose();
}

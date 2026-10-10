using FSH.Framework.Core.Context;
using FSH.Modules.Inventory.Contracts.v1.StockTransfers;
using FSH.Modules.Inventory.Data;
using FSH.Modules.Inventory.Domain;
using FSH.Modules.Inventory.Features.v1.StockTransfers.CreateStockTransfer;
using FSH.Modules.Inventory.Services;
using FSH.Modules.Multitenancy.Contracts;
using NSubstitute;

namespace Inventory.Tests.Features;

public sealed class CreateStockTransferCommandHandlerTests : IDisposable
{
    private readonly InventoryDbContext _db = InventoryDbContextFactory.Create();
    private readonly ICurrentUser _currentUser = Substitute.For<ICurrentUser>();

    public CreateStockTransferCommandHandlerTests() => _currentUser.GetUserId().Returns(Guid.CreateVersion7());

    private CreateStockTransferCommandHandler CreateSut(Guid fromBranchId)
    {
        var currentBranch = Substitute.For<ICurrentBranch>();
        currentBranch.RequireBranchIdAsync(Arg.Any<CancellationToken>()).Returns(fromBranchId);

        var branchService = Substitute.For<IBranchService>();
        branchService.IsActiveBranchOfCurrentTenantAsync(Arg.Any<Guid>(), Arg.Any<CancellationToken>()).Returns(true);

        var stockDeductionService = new StockDeductionService(_db, currentBranch);

        return new CreateStockTransferCommandHandler(_db, _currentUser, currentBranch, branchService, stockDeductionService);
    }

    [Fact]
    public async Task Handle_Should_Resolve_FromBranchId_Via_CurrentBranch_And_Keep_ToBranchId_From_Command()
    {
        var resolvedFromBranchId = Guid.CreateVersion7();
        var explicitToBranchId = Guid.CreateVersion7();
        var medicineId = Guid.CreateVersion7();

        var sourceBatch = MedicineBatch.Create(
            medicineId, resolvedFromBranchId, "B001", DateOnly.FromDateTime(DateTime.UtcNow.AddYears(1)), 50m, 1m, 2m, null);
        _db.MedicineBatches.Add(sourceBatch);
        await _db.SaveChangesAsync(CancellationToken.None);

        var sut = CreateSut(resolvedFromBranchId);

        var command = new CreateStockTransferCommand(
            resolvedFromBranchId, explicitToBranchId, "notes",
            [new StockTransferLineInput(medicineId, 10m)]);

        var transferId = await sut.Handle(command, CancellationToken.None);

        var transfer = _db.StockTransfers.Single(t => t.Id == transferId);
        // FromBranchId must come from ICurrentBranch, never from client input.
        transfer.FromBranchId.ShouldBe(resolvedFromBranchId);
        // ToBranchId is the explicit destination the user chose.
        transfer.ToBranchId.ShouldBe(explicitToBranchId);

        var outboundTransaction = _db.InventoryTransactions.Single(t => t.ReferenceId == transferId);
        outboundTransaction.BranchId.ShouldBe(resolvedFromBranchId);
    }

    public void Dispose() => _db.Dispose();
}

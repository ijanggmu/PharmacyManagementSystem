using FSH.Modules.Inventory.Contracts.v1.StockCounts;
using FSH.Modules.Inventory.Data;
using FSH.Modules.Inventory.Domain;
using FSH.Modules.Multitenancy.Contracts;
using Mediator;

namespace FSH.Modules.Inventory.Features.v1.StockCounts.CreateStockCountSession;

/// <summary>Creates a Draft count session at the caller's branch. Lots are only snapshotted on start.</summary>
public sealed class CreateStockCountSessionCommandHandler(
    InventoryDbContext dbContext,
    ICurrentBranch currentBranch,
    TimeProvider timeProvider)
    : ICommandHandler<CreateStockCountSessionCommand, Guid>
{
    public async ValueTask<Guid> Handle(CreateStockCountSessionCommand command, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(command);

        Guid branchId = await currentBranch.RequireBranchIdAsync(cancellationToken).ConfigureAwait(false);
        var session = StockCountSession.Create(
            branchId, command.Title, command.CategoryId, command.RackLocation, command.SupplierId, command.Notes,
            timeProvider.GetUtcNow().UtcDateTime);

        dbContext.StockCountSessions.Add(session);
        await dbContext.SaveChangesAsync(cancellationToken).ConfigureAwait(false);
        return session.Id;
    }
}

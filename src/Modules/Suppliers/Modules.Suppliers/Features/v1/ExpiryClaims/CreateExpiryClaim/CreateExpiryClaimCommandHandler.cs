using System.Globalization;
using System.Net;
using FSH.Framework.Core.Exceptions;
using FSH.Modules.Inventory.Contracts.v1.Batches;
using FSH.Modules.Multitenancy.Contracts;
using FSH.Modules.Suppliers.Contracts.v1.ExpiryClaims;
using FSH.Modules.Suppliers.Data;
using FSH.Modules.Suppliers.Domain;
using FSH.Modules.Suppliers.Services;
using Mediator;
using Microsoft.EntityFrameworkCore;

namespace FSH.Modules.Suppliers.Features.v1.ExpiryClaims.CreateExpiryClaim;

/// <summary>
/// Drafts a claim for lots of the caller's branch. Each lot must be live, not consigned, have the units
/// claimed (less what other open claims hold), and must not be proven to come from a different supplier (a
/// lot attributed only by the medicine's preferred supplier, or not at all, may be claimed from any supplier
/// — the debit note's own lot check runs again on acceptance). The claim snapshots each lot's cost.
/// </summary>
public sealed class CreateExpiryClaimCommandHandler(
    SuppliersDbContext dbContext,
    IMediator mediator,
    ICurrentBranch currentBranch)
    : ICommandHandler<CreateExpiryClaimCommand, Guid>
{
    public async ValueTask<Guid> Handle(CreateExpiryClaimCommand command, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(command);

        bool supplierExists = await dbContext.Suppliers.AnyAsync(s => s.Id == command.SupplierId, cancellationToken)
            .ConfigureAwait(false);
        if (!supplierExists)
        {
            throw new NotFoundException($"Supplier {command.SupplierId} not found.");
        }

        Guid branchId = await currentBranch.RequireBranchIdAsync(cancellationToken).ConfigureAwait(false);
        var batchIds = command.Lines.Select(l => l.BatchId).Distinct().ToList();
        var sources = (await mediator.Send(new GetBatchSourcesQuery(batchIds), cancellationToken).ConfigureAwait(false))
            .ToDictionary(s => s.BatchId);
        var attribution = await ExpiryClaimLots.AttributeAsync(mediator, sources.Values.ToList(), cancellationToken)
            .ConfigureAwait(false);
        var claimed = await ExpiryClaimLots.OpenClaimedAsync(dbContext, batchIds, null, cancellationToken).ConfigureAwait(false);

        var claim = ExpiryClaim.Create(command.SupplierId, branchId, command.Notes, DateTime.UtcNow);
        foreach (var input in command.Lines)
        {
            if (!sources.TryGetValue(input.BatchId, out var lot) || lot.BranchId != branchId)
            {
                throw new NotFoundException($"Batch {input.BatchId} not found at this branch.");
            }

            if (lot.IsDisposed || lot.IsConsigned)
            {
                throw Conflict(lot.IsConsigned
                    ? $"Batch {lot.BatchNo} is consigned stock: settle it with the supplier instead of claiming it."
                    : $"Batch {lot.BatchNo} has been written off.");
            }

            var who = attribution[lot.BatchId];
            if (who.IsProven && who.SupplierId != command.SupplierId)
            {
                throw Conflict($"Batch {lot.BatchNo} of {lot.MedicineName} was delivered by another supplier.");
            }

            decimal available = lot.QuantityOnHand - claimed.GetValueOrDefault(lot.BatchId);
            if (input.Quantity > available)
            {
                throw Conflict(string.Create(CultureInfo.InvariantCulture,
                    $"Only {Math.Max(0m, available)} of batch {lot.BatchNo} can be claimed (on hand {lot.QuantityOnHand}, already on open claims {claimed.GetValueOrDefault(lot.BatchId)})."));
            }

            claim.AddLine(lot.MedicineId, lot.MedicineName, lot.BatchId, lot.BatchNo, lot.ExpiryDate, input.Quantity, lot.CostPrice);
        }

        dbContext.ExpiryClaims.Add(claim);
        await dbContext.SaveChangesAsync(cancellationToken).ConfigureAwait(false);
        return claim.Id;
    }

    private static CustomException Conflict(string message) =>
        new(message, (IEnumerable<string>?)null, HttpStatusCode.Conflict);
}

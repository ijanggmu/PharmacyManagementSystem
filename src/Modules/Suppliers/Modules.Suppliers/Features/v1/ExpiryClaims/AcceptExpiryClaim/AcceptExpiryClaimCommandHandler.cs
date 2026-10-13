using System.Net;
using FSH.Framework.Core.Exceptions;
using FSH.Modules.Multitenancy.Contracts;
using FSH.Modules.Suppliers.Contracts.v1.ExpiryClaims;
using FSH.Modules.Suppliers.Contracts.v1.Returns;
using FSH.Modules.Suppliers.Data;
using FSH.Modules.Suppliers.Domain;
using FSH.Modules.Suppliers.Services;
using Mediator;
using Microsoft.EntityFrameworkCore;

namespace FSH.Modules.Suppliers.Features.v1.ExpiryClaims.AcceptExpiryClaim;

/// <summary>
/// The supplier accepted the claim, in full or in part. The accepted units go back through the ordinary
/// supplier return (<see cref="CreateSupplierReturnCommand"/>): one line per accepted lot, pinned to that lot,
/// reason "Expiry" — so the debit note, the stock deduction, the AP credit, the input-VAT reversal and the GL
/// posting are exactly those of any return. The claim is locked first and the return runs inside the same
/// transaction (the return handler joins an open one), so a claim is never accepted without its debit note,
/// or the other way round, and a double click can't raise two debit notes.
///
/// The return deducts from the caller's current branch, so the caller must be working at the claim's branch.
/// </summary>
public sealed class AcceptExpiryClaimCommandHandler(
    SuppliersDbContext dbContext,
    IMediator mediator,
    ICurrentBranch currentBranch)
    : ICommandHandler<AcceptExpiryClaimCommand, Guid>
{
    public async ValueTask<Guid> Handle(AcceptExpiryClaimCommand command, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(command);

        Guid branchId = await currentBranch.RequireBranchIdAsync(cancellationToken).ConfigureAwait(false);

        return await SupplierRowLock.InTransactionAsync(dbContext, async () =>
        {
            var claim = await ExpiryClaimMapper.LockAsync(dbContext, currentBranch, command.ClaimId, cancellationToken)
                .ConfigureAwait(false);
            if (claim.BranchId is { } claimBranch && claimBranch != branchId)
            {
                throw new CustomException(
                    "This claim's stock is at another branch. Switch to that branch to accept it.",
                    (IEnumerable<string>?)null, HttpStatusCode.Conflict);
            }

            var accepted = (command.Lines ?? []).ToDictionary(l => l.LineId, l => l.AcceptedQuantity);
            claim.Accept(accepted, DateTime.UtcNow);
            await dbContext.SaveChangesAsync(cancellationToken).ConfigureAwait(false);

            var items = claim.Lines
                .Where(l => l.AcceptedQuantity > 0)
                .Select(l => new SupplierReturnItemInput(
                    l.MedicineId, l.AcceptedQuantity!.Value, l.UnitCost, ExpiryClaim.ReturnReason,
                    $"Expiry claim {claim.ClaimNumber}", l.BatchId))
                .ToList();

            Guid returnId = await mediator.Send(
                new CreateSupplierReturnCommand(
                    claim.SupplierId, command.ReturnDateUtc, $"Expiry claim {claim.ClaimNumber}", items,
                    command.SupplierInvoiceNumber, command.ReverseInputVat),
                cancellationToken).ConfigureAwait(false);

            string? debitNote = await dbContext.SupplierReturns.AsNoTracking()
                .Where(r => r.Id == returnId)
                .Select(r => r.DocumentNumber)
                .FirstOrDefaultAsync(cancellationToken)
                .ConfigureAwait(false);
            claim.LinkReturn(returnId, debitNote);
            await dbContext.SaveChangesAsync(cancellationToken).ConfigureAwait(false);
            return returnId;
        }, cancellationToken).ConfigureAwait(false);
    }
}

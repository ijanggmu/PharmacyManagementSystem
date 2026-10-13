using System.Net;
using FSH.Framework.Core.Exceptions;
using FSH.Modules.Multitenancy.Contracts;
using FSH.Modules.Suppliers.Contracts.v1.ExpiryClaims;
using FSH.Modules.Suppliers.Data;
using FSH.Modules.Suppliers.Services;
using Mediator;

namespace FSH.Modules.Suppliers.Features.v1.ExpiryClaims.ChangeExpiryClaimStatus;

/// <summary>
/// Mark sent, reject, or mark credited. None of these move stock or money (acceptance does). The claim row is
/// locked so a rejection can't overwrite an acceptance committing at the same moment.
/// </summary>
public sealed class ChangeExpiryClaimStatusCommandHandler(SuppliersDbContext dbContext, ICurrentBranch currentBranch)
    : ICommandHandler<ChangeExpiryClaimStatusCommand, Guid>
{
    public async ValueTask<Guid> Handle(ChangeExpiryClaimStatusCommand command, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(command);

        return await SupplierRowLock.InTransactionAsync(dbContext, async () =>
        {
            var claim = await ExpiryClaimMapper.LockAsync(dbContext, currentBranch, command.ClaimId, cancellationToken)
                .ConfigureAwait(false);
            DateTime now = DateTime.UtcNow;

            switch (command.Action)
            {
                case ExpiryClaimAction.MarkSent:
                    claim.MarkSent(now);
                    break;
                case ExpiryClaimAction.Reject:
                    claim.Reject(command.Reason ?? string.Empty, now);
                    break;
                case ExpiryClaimAction.MarkCredited:
                    claim.MarkCredited(command.Reference, now);
                    break;
                default:
                    throw new CustomException(
                        $"Unknown expiry claim action {command.Action}.", (IEnumerable<string>?)null, HttpStatusCode.BadRequest);
            }

            await dbContext.SaveChangesAsync(cancellationToken).ConfigureAwait(false);
            return claim.Id;
        }, cancellationToken).ConfigureAwait(false);
    }
}

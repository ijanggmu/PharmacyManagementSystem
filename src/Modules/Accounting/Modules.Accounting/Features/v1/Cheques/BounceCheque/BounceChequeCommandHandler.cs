using FSH.Framework.Core.Context;
using FSH.Modules.Accounting.Contracts.Dtos;
using FSH.Modules.Accounting.Contracts.v1.Cheques;
using FSH.Modules.Accounting.Data;
using FSH.Modules.Accounting.Services;
using FSH.Modules.Identity.Contracts.Services;
using FSH.Modules.Multitenancy.Contracts;
using Mediator;

namespace FSH.Modules.Accounting.Features.v1.Cheques.BounceCheque;

/// <summary>
/// The bank returned the cheque unpaid: voids the payment it settled (<see cref="ChequePaymentVoider"/>), then marks
/// the cheque bounced. The void runs first, in the owning module's own transaction, so a refused void (already voided,
/// no permission) leaves the cheque as it was. A cleared cheque can't bounce.
/// </summary>
public sealed class BounceChequeCommandHandler(
    AccountingDbContext dbContext,
    IMediator mediator,
    ICurrentUser currentUser,
    ICurrentBranch currentBranch,
    IUserPermissionService permissions,
    TimeProvider timeProvider) : ICommandHandler<BounceChequeCommand, ChequeDto>
{
    public async ValueTask<ChequeDto> Handle(BounceChequeCommand command, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(command);

        var cheque = await ChequeLoader.LoadForUpdateAsync(dbContext, currentBranch, command.ChequeId, cancellationToken).ConfigureAwait(false);
        DateTime now = timeProvider.GetUtcNow().UtcDateTime;

        // Checked before the void so an impossible move never voids the payment.
        if (!cheque.CanBounce)
        {
            cheque.Bounce(now, ChequeLoader.Actor(currentUser), command.Reason);
        }

        await ChequePaymentVoider.VoidAsync(cheque, "bounced", command.Reason, mediator, currentUser, permissions, cancellationToken)
            .ConfigureAwait(false);

        cheque.Bounce(now, ChequeLoader.Actor(currentUser), command.Reason);
        await dbContext.SaveChangesAsync(cancellationToken).ConfigureAwait(false);
        return ChequeRegister.ToDto(cheque, withHistory: true);
    }
}

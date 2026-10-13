using FSH.Framework.Core.Context;
using FSH.Modules.Accounting.Contracts.Dtos;
using FSH.Modules.Accounting.Contracts.v1.Cheques;
using FSH.Modules.Accounting.Data;
using FSH.Modules.Accounting.Features.v1.Cheques.BounceCheque;
using FSH.Modules.Accounting.Services;
using FSH.Modules.Identity.Contracts.Services;
using FSH.Modules.Multitenancy.Contracts;
using Mediator;

namespace FSH.Modules.Accounting.Features.v1.Cheques.CancelCheque;

/// <summary>
/// The cheque will never reach the bank (handed back to the customer, or torn up before the supplier presented it):
/// voids the payment it settled (<see cref="ChequePaymentVoider"/>) and marks it cancelled. Only a received cheque on
/// hand or an issued cheque not yet presented qualifies — once at the bank, an unpaid cheque has bounced.
/// </summary>
public sealed class CancelChequeCommandHandler(
    AccountingDbContext dbContext,
    IMediator mediator,
    ICurrentUser currentUser,
    ICurrentBranch currentBranch,
    IUserPermissionService permissions,
    TimeProvider timeProvider) : ICommandHandler<CancelChequeCommand, ChequeDto>
{
    public async ValueTask<ChequeDto> Handle(CancelChequeCommand command, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(command);

        var cheque = await ChequeLoader.LoadForUpdateAsync(dbContext, currentBranch, command.ChequeId, cancellationToken).ConfigureAwait(false);
        DateTime now = timeProvider.GetUtcNow().UtcDateTime;

        // Checked before the void so an impossible move never voids the payment.
        if (!cheque.CanCancel)
        {
            cheque.Cancel(now, ChequeLoader.Actor(currentUser), command.Reason);
        }

        await ChequePaymentVoider.VoidAsync(cheque, "cancelled", command.Reason, mediator, currentUser, permissions, cancellationToken)
            .ConfigureAwait(false);

        cheque.Cancel(now, ChequeLoader.Actor(currentUser), command.Reason);
        await dbContext.SaveChangesAsync(cancellationToken).ConfigureAwait(false);
        return ChequeRegister.ToDto(cheque, withHistory: true);
    }
}

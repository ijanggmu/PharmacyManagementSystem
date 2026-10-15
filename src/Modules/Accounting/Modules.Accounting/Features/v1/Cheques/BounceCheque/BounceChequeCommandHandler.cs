using System.Net;
using FSH.Framework.Core.Context;
using FSH.Framework.Core.Exceptions;
using FSH.Modules.Accounting.Contracts.Dtos;
using FSH.Modules.Accounting.Contracts.Services;
using FSH.Modules.Accounting.Contracts.v1.Cheques;
using FSH.Modules.Accounting.Data;
using FSH.Modules.Accounting.Features.v1.Cheques.ClearCheque;
using FSH.Modules.Accounting.Services;
using FSH.Modules.Identity.Contracts.Services;
using FSH.Modules.Multitenancy.Contracts;
using Mediator;

namespace FSH.Modules.Accounting.Features.v1.Cheques.BounceCheque;

/// <summary>
/// The bank returned the cheque unpaid: voids the payment it settled (<see cref="ChequePaymentVoider"/>), then marks
/// the cheque bounced. The void runs first, in the owning module's own transaction, so a refused void (already voided,
/// no permission) leaves the cheque as it was.
/// <para>A cheque the bank returned after it was marked cleared can bounce too. For a post-dated one the clearance
/// voucher (received: Dr Bank / Cr Cheques in Hand; issued: Dr Cheques Issued / Cr Bank) is reversed with the status
/// change — dated today, or the first open day — so with the payment's own reversal the bank, not the holding
/// account, gives the money back. This is the only path that may void the payment of a cleared cheque: the party's
/// ledger refuses it (the void command's register-only bypass is set by <see cref="ChequePaymentVoider"/>).</para>
/// </summary>
public sealed class BounceChequeCommandHandler(
    AccountingDbContext dbContext,
    IMediator mediator,
    IVoucherPostingService voucherPostingService,
    ICurrentUser currentUser,
    ICurrentBranch currentBranch,
    IUserPermissionService permissions,
    TimeProvider timeProvider) : ICommandHandler<BounceChequeCommand, ChequeDto>
{
    public async ValueTask<ChequeDto> Handle(BounceChequeCommand command, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(command);

        var cheque = await ChequeLoader.LoadForUpdateAsync(dbContext, currentBranch, command.ChequeId, cancellationToken).ConfigureAwait(false);
        // The business day the bank returned it: the date given, else now. Never before the cheque was cleared or
        // deposited (the reversal is dated on or after the clearance by the posting service too).
        DateTime now = command.BouncedDateUtc ?? timeProvider.GetUtcNow().UtcDateTime;
        DateTime? latestMove = cheque.ClearedDateUtc ?? cheque.DepositedDateUtc;
        if (latestMove is { } moved && NepalDate.FromUtc(now) < NepalDate.FromUtc(moved))
        {
            throw new CustomException(
                $"Cheque {cheque.ChequeNumber} can't bounce before {NepalDate.FromUtc(moved):yyyy-MM-dd}, the day it was last deposited or cleared.",
                (IEnumerable<string>?)null, HttpStatusCode.BadRequest);
        }

        string actor = ChequeLoader.Actor(currentUser);

        // Checked before the void so an impossible move never voids the payment.
        if (!cheque.CanBounce)
        {
            cheque.Bounce(now, actor, command.Reason);
        }

        // Read before the status moves off cleared.
        bool reverseClearance = cheque.BounceReversesClearance;

        await ChequePaymentVoider.VoidAsync(cheque, "bounced", command.Reason, mediator, currentUser, permissions, cancellationToken)
            .ConfigureAwait(false);

        if (!reverseClearance)
        {
            cheque.Bounce(now, actor, command.Reason);
            await dbContext.SaveChangesAsync(cancellationToken).ConfigureAwait(false);
            return ChequeRegister.ToDto(cheque, withHistory: true);
        }

        return await AccountingTransaction.RunAsync(dbContext, async () =>
        {
            var change = cheque.Bounce(now, actor, command.Reason);
            Guid? reversalId = await voucherPostingService.ReverseSystemVoucherAsync(
                ClearChequeCommandHandler.ReferenceType,
                cheque.Id,
                $"Cheque {cheque.ChequeNumber} bounced after clearing: {command.Reason.Trim()}",
                now,
                cancellationToken).ConfigureAwait(false);
            if (reversalId is { } id)
            {
                change.AttachVoucher(id);
            }

            await dbContext.SaveChangesAsync(cancellationToken).ConfigureAwait(false);
            return ChequeRegister.ToDto(cheque, withHistory: true);
        }, cancellationToken).ConfigureAwait(false);
    }
}

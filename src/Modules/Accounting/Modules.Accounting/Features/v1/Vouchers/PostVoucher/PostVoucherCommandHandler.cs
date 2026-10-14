using FSH.Framework.Core.Context;
using FSH.Framework.Core.Exceptions;
using FSH.Modules.Accounting.Contracts.v1.Vouchers;
using FSH.Modules.Accounting.Data;
using FSH.Modules.Accounting.Domain;
using FSH.Modules.Accounting.Services;
using FSH.Modules.Multitenancy.Contracts;
using FSH.Modules.Reference.Contracts.Controls;
using Mediator;
using Microsoft.EntityFrameworkCore;

namespace FSH.Modules.Accounting.Features.v1.Vouchers.PostVoucher;

/// <summary>
/// Posts a draft voucher. Segregation of duties: when the tenant turns on
/// <see cref="InternalControlSettings.VoucherCreatorCannotPostKey"/>, the user who drafted a manual voucher, or last
/// edited it, can't post it (403) - another holder of Vouchers.Post must. Vouchers saved before the creator was
/// recorded (null) are not blocked.
/// </summary>
public sealed class PostVoucherCommandHandler(
    AccountingDbContext dbContext,
    IAccountingVoucherNumbers sequenceService,
    AccountingPostingLockService postingLockService,
    ICurrentUser currentUser,
    ICurrentBranch currentBranch,
    IMediator mediator) : ICommandHandler<PostVoucherCommand, Guid>
{
    public async ValueTask<Guid> Handle(PostVoucherCommand command, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(command);

        var voucher = await dbContext.Vouchers
            .Include(v => v.Lines)
            .FirstOrDefaultAsync(v => v.Id == command.VoucherId, cancellationToken)
            .ConfigureAwait(false)
            ?? throw new NotFoundException($"Voucher {command.VoucherId} not found.");

        await currentBranch.EnsureCanSeeBranchAsync(voucher.BranchId, $"Voucher {command.VoucherId} not found.", cancellationToken).ConfigureAwait(false);

        await postingLockService.AssertPostingOpenAsync(voucher.VoucherDateUtc, cancellationToken).ConfigureAwait(false);

        // A draft may predate its account becoming a group (or being deactivated) — re-check at posting time.
        await AccountingPostableAccounts
            .EnsurePostableAsync(dbContext, voucher.Lines.Select(l => l.AccountId), cancellationToken)
            .ConfigureAwait(false);
        if (voucher.Source == AccountingVoucherSource.Manual)
        {
            // A draft saved before the control-account rule (or edited around it) is refused here too.
            await AccountingPostableAccounts
                .EnsureNoControlAccountsAsync(dbContext, voucher.Lines.Select(l => l.AccountId), cancellationToken)
                .ConfigureAwait(false);

            await EnsureSegregationOfDutiesAsync(voucher, cancellationToken).ConfigureAwait(false);
        }

        // Every check first: a voucher that can't post (unbalanced, a line rounding to zero) must not consume a
        // number. Then the number is reserved in the same transaction as the post, so a failed save rolls the
        // counter back with it and the series stays gap-free.
        voucher.EnsureReadyToPost();
        string series = VoucherSeries.ForVoucherType(voucher.VoucherType);
        string postedBy = currentUser.Name ?? currentUser.GetUserId().ToString();

        return await AccountingTransaction.RunAsync(dbContext, async () =>
        {
            int number = await sequenceService.ReserveNextNumberAsync(series, cancellationToken).ConfigureAwait(false);
            voucher.Post(VoucherSeries.Format(series, number), postedBy);
            await dbContext.SaveChangesAsync(cancellationToken).ConfigureAwait(false);
            return voucher.Id;
        }, cancellationToken).ConfigureAwait(false);
    }

    private async ValueTask EnsureSegregationOfDutiesAsync(AccountingVoucher voucher, CancellationToken cancellationToken)
    {
        if (!await VoucherSegregationOfDuties.IsOnAsync(mediator, cancellationToken).ConfigureAwait(false))
        {
            return;
        }

        string me = currentUser.GetUserId().ToString();
        bool drafted = string.Equals(voucher.CreatedBy, me, StringComparison.OrdinalIgnoreCase);
        bool edited = string.Equals(voucher.LastModifiedBy, me, StringComparison.OrdinalIgnoreCase);
        if (drafted || edited)
        {
            string what = drafted ? "drafted" : "last edited";
            throw new ForbiddenException(
                $"Segregation of duties is on: you {what} this voucher, so someone else " +
                "with permission to post vouchers has to post it.");
        }
    }
}

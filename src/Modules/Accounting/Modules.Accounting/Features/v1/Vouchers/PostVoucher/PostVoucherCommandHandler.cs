using FSH.Framework.Core.Context;
using FSH.Framework.Core.Exceptions;
using FSH.Modules.Accounting.Contracts.v1.Vouchers;
using FSH.Modules.Accounting.Data;
using FSH.Modules.Accounting.Domain;
using FSH.Modules.Accounting.Services;
using FSH.Modules.Multitenancy.Contracts;
using Mediator;
using Microsoft.EntityFrameworkCore;

namespace FSH.Modules.Accounting.Features.v1.Vouchers.PostVoucher;

public sealed class PostVoucherCommandHandler(
    AccountingDbContext dbContext,
    AccountingVoucherSequenceService sequenceService,
    AccountingPostingLockService postingLockService,
    ICurrentUser currentUser,
    ICurrentBranch currentBranch) : ICommandHandler<PostVoucherCommand, Guid>
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
        }

        string series = VoucherSeries.ForVoucherType(voucher.VoucherType);
        int number = await sequenceService.ReserveNextNumberAsync(series, cancellationToken).ConfigureAwait(false);
        string postedBy = currentUser.Name ?? currentUser.GetUserId().ToString();
        voucher.Post(VoucherSeries.Format(series, number), postedBy);

        await dbContext.SaveChangesAsync(cancellationToken).ConfigureAwait(false);
        return voucher.Id;
    }
}

using FSH.Framework.Core.Context;
using FSH.Framework.Core.Exceptions;
using FSH.Modules.Accounting.Contracts.v1.Vouchers;
using FSH.Modules.Accounting.Data;
using FSH.Modules.Accounting.Services;
using Mediator;
using Microsoft.EntityFrameworkCore;

namespace FSH.Modules.Accounting.Features.v1.Vouchers.PostVoucher;

public sealed class PostVoucherCommandHandler(
    AccountingDbContext dbContext,
    AccountingVoucherSequenceService sequenceService,
    AccountingPostingLockService postingLockService,
    ICurrentUser currentUser) : ICommandHandler<PostVoucherCommand, Guid>
{
    public async ValueTask<Guid> Handle(PostVoucherCommand command, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(command);

        var voucher = await dbContext.Vouchers
            .Include(v => v.Lines)
            .FirstOrDefaultAsync(v => v.Id == command.VoucherId, cancellationToken)
            .ConfigureAwait(false)
            ?? throw new NotFoundException($"Voucher {command.VoucherId} not found.");

        await postingLockService.AssertPostingOpenAsync(voucher.VoucherDateUtc, cancellationToken).ConfigureAwait(false);

        // A draft may predate its account becoming a group (or being deactivated) — re-check at posting time.
        await AccountingPostableAccounts
            .EnsurePostableAsync(dbContext, voucher.Lines.Select(l => l.AccountId), cancellationToken)
            .ConfigureAwait(false);

        int number = await sequenceService.ReserveNextNumberAsync(cancellationToken).ConfigureAwait(false);
        string postedBy = currentUser.Name ?? currentUser.GetUserId().ToString();
        voucher.Post($"MV-{number:D6}", postedBy);

        await dbContext.SaveChangesAsync(cancellationToken).ConfigureAwait(false);
        return voucher.Id;
    }
}

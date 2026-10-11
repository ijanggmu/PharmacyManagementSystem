using FSH.Framework.Core.Context;
using FSH.Modules.Accounting.Contracts.Services;
using FSH.Modules.Accounting.Contracts.v1.Vouchers;
using FSH.Modules.Accounting.Data;
using FSH.Modules.Accounting.Services;
using FSH.Modules.Multitenancy.Contracts;
using Mediator;

namespace FSH.Modules.Accounting.Features.v1.Vouchers.ReverseVoucher;

public sealed class ReverseVoucherCommandHandler(
    IVoucherPostingService voucherPostingService, ICurrentUser currentUser, AccountingDbContext dbContext, ICurrentBranch currentBranch)
    : ICommandHandler<ReverseVoucherCommand, Guid>
{
    public async ValueTask<Guid> Handle(ReverseVoucherCommand command, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(command);
        await VoucherBranchGuard.EnsureCanActOnVoucherAsync(dbContext, currentBranch, command.VoucherId, cancellationToken).ConfigureAwait(false);
        await OpeningBalanceVoucherGuard.EnsureNotOpeningBalanceAsync(dbContext, command.VoucherId, cancellationToken).ConfigureAwait(false);

        string reversedBy = currentUser.Name ?? currentUser.GetUserId().ToString();
        return await voucherPostingService
            .ReverseAsync(command.VoucherId, reversedBy, command.ReversalDateUtc, cancellationToken)
            .ConfigureAwait(false);
    }
}

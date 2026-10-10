using FSH.Framework.Core.Context;
using FSH.Modules.Accounting.Contracts.Services;
using FSH.Modules.Accounting.Contracts.v1.Vouchers;
using FSH.Modules.Accounting.Data;
using FSH.Modules.Accounting.Services;
using Mediator;

namespace FSH.Modules.Accounting.Features.v1.Vouchers.ReverseVoucher;

public sealed class ReverseVoucherCommandHandler(
    IVoucherPostingService voucherPostingService, ICurrentUser currentUser, AccountingDbContext dbContext)
    : ICommandHandler<ReverseVoucherCommand, Guid>
{
    public async ValueTask<Guid> Handle(ReverseVoucherCommand command, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(command);
        await OpeningBalanceVoucherGuard.EnsureNotOpeningBalanceAsync(dbContext, command.VoucherId, cancellationToken).ConfigureAwait(false);

        string reversedBy = currentUser.Name ?? currentUser.GetUserId().ToString();
        return await voucherPostingService
            .ReverseAsync(command.VoucherId, reversedBy, command.ReversalDateUtc, cancellationToken)
            .ConfigureAwait(false);
    }
}

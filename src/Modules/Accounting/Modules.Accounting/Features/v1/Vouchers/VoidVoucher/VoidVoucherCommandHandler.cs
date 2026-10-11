using FSH.Modules.Accounting.Contracts.Services;
using FSH.Modules.Accounting.Contracts.v1.Vouchers;
using FSH.Modules.Accounting.Data;
using FSH.Modules.Accounting.Services;
using Mediator;

namespace FSH.Modules.Accounting.Features.v1.Vouchers.VoidVoucher;

public sealed class VoidVoucherCommandHandler(IVoucherPostingService voucherPostingService, AccountingDbContext dbContext)
    : ICommandHandler<VoidVoucherCommand, Guid>
{
    public async ValueTask<Guid> Handle(VoidVoucherCommand command, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(command);
        await OpeningBalanceVoucherGuard.EnsureNotOpeningBalanceAsync(dbContext, command.VoucherId, cancellationToken).ConfigureAwait(false);

        await voucherPostingService.VoidAsync(command.VoucherId, command.Reason, cancellationToken).ConfigureAwait(false);
        return command.VoucherId;
    }
}

using FSH.Modules.Accounting.Contracts.Services;
using FSH.Modules.Accounting.Contracts.v1.Vouchers;
using FSH.Modules.Accounting.Data;
using FSH.Modules.Accounting.Services;
using FSH.Modules.Multitenancy.Contracts;
using Mediator;

namespace FSH.Modules.Accounting.Features.v1.Vouchers.VoidVoucher;

/// <summary>Voids a posted manual voucher outright. <see cref="IVoucherPostingService.VoidAsync"/> refuses
/// system vouchers (they mirror a business document and must be reversed) and vouchers dated on or
/// before the posting-lock date — the void would change a closed period.</summary>
public sealed class VoidVoucherCommandHandler(
    IVoucherPostingService voucherPostingService, AccountingDbContext dbContext, ICurrentBranch currentBranch)
    : ICommandHandler<VoidVoucherCommand, Guid>
{
    public async ValueTask<Guid> Handle(VoidVoucherCommand command, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(command);
        await VoucherBranchGuard.EnsureCanActOnVoucherAsync(dbContext, currentBranch, command.VoucherId, cancellationToken).ConfigureAwait(false);
        await OpeningBalanceVoucherGuard.EnsureNotOpeningBalanceAsync(dbContext, command.VoucherId, cancellationToken).ConfigureAwait(false);

        await voucherPostingService.VoidAsync(command.VoucherId, command.Reason, cancellationToken).ConfigureAwait(false);
        return command.VoucherId;
    }
}

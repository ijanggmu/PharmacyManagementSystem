using FSH.Framework.Core.Exceptions;
using FSH.Modules.Accounting.Contracts.v1.Vouchers;
using FSH.Modules.Accounting.Data;
using FSH.Modules.Multitenancy.Contracts;
using Mediator;
using Microsoft.EntityFrameworkCore;

namespace FSH.Modules.Accounting.Features.v1.Vouchers.DeleteVoucher;

public sealed class DeleteVoucherCommandHandler(AccountingDbContext dbContext, ICurrentBranch currentBranch)
    : ICommandHandler<DeleteVoucherCommand, Guid>
{
    public async ValueTask<Guid> Handle(DeleteVoucherCommand command, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(command);

        var voucher = await dbContext.Vouchers
            .FirstOrDefaultAsync(v => v.Id == command.VoucherId, cancellationToken)
            .ConfigureAwait(false)
            ?? throw new NotFoundException($"Voucher {command.VoucherId} not found.");

        await currentBranch.EnsureCanSeeBranchAsync(voucher.BranchId, $"Voucher {command.VoucherId} not found.", cancellationToken).ConfigureAwait(false);

        // Throws 409 unless still Draft — a posted or voided voucher is immutable (rule.md §9.1)
        // and must be reversed, never deleted.
        voucher.EnsureDraft();

        dbContext.Vouchers.Remove(voucher);
        await dbContext.SaveChangesAsync(cancellationToken).ConfigureAwait(false);
        return voucher.Id;
    }
}

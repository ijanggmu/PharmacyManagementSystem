using FSH.Framework.Core.Exceptions;
using FSH.Modules.Accounting.Contracts.v1.Vouchers;
using FSH.Modules.Accounting.Data;
using FSH.Modules.Accounting.Services;
using FSH.Modules.Multitenancy.Contracts;
using Mediator;
using Microsoft.EntityFrameworkCore;

namespace FSH.Modules.Accounting.Features.v1.Vouchers.UpdateVoucher;

public sealed class UpdateVoucherCommandHandler(AccountingDbContext dbContext, ICurrentBranch currentBranch)
    : ICommandHandler<UpdateVoucherCommand, Guid>
{
    public async ValueTask<Guid> Handle(UpdateVoucherCommand command, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(command);

        var voucher = await dbContext.Vouchers
            .Include(v => v.Lines)
            .FirstOrDefaultAsync(v => v.Id == command.VoucherId, cancellationToken)
            .ConfigureAwait(false)
            ?? throw new NotFoundException($"Voucher {command.VoucherId} not found.");

        await currentBranch.EnsureCanSeeBranchAsync(voucher.BranchId, $"Voucher {command.VoucherId} not found.", cancellationToken).ConfigureAwait(false);

        // UpdateDraft/ClearLines both guard on Status == Draft and throw 409 otherwise — a posted
        // or voided voucher is immutable (rule.md §9.1); only reverse/void touch those.
        voucher.UpdateDraft(command.VoucherDateUtc, command.Narration);
        await AccountingPostableAccounts
            .EnsurePostableAsync(dbContext, command.Lines.Select(l => l.AccountId), cancellationToken)
            .ConfigureAwait(false);
        await AccountingPostableAccounts
            .EnsureNoControlAccountsAsync(dbContext, command.Lines.Select(l => l.AccountId), cancellationToken)
            .ConfigureAwait(false);
        voucher.ClearLines();
        foreach (var line in command.Lines)
        {
            voucher.AddLine(line.AccountId, line.Description, line.DebitAmount, line.CreditAmount);
        }

        await dbContext.SaveChangesAsync(cancellationToken).ConfigureAwait(false);
        return voucher.Id;
    }
}

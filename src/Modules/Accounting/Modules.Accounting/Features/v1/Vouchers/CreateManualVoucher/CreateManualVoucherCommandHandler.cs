using FSH.Modules.Accounting.Contracts.v1.Vouchers;
using FSH.Modules.Accounting.Data;
using FSH.Modules.Accounting.Domain;
using FSH.Modules.Accounting.Services;
using FSH.Modules.Multitenancy.Contracts;
using Mediator;

namespace FSH.Modules.Accounting.Features.v1.Vouchers.CreateManualVoucher;

public sealed class CreateManualVoucherCommandHandler(AccountingDbContext dbContext, ICurrentBranch currentBranch)
    : ICommandHandler<CreateManualVoucherCommand, Guid>
{
    public async ValueTask<Guid> Handle(CreateManualVoucherCommand command, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(command);

        await AccountingPostableAccounts
            .EnsurePostableAsync(dbContext, command.Lines.Select(l => l.AccountId), cancellationToken)
            .ConfigureAwait(false);
        await AccountingPostableAccounts
            .EnsureNoControlAccountsAsync(dbContext, command.Lines.Select(l => l.AccountId), cancellationToken)
            .ConfigureAwait(false);

        Guid? branchId = await currentBranch.GetBranchIdAsync(cancellationToken).ConfigureAwait(false);

        var voucher = AccountingVoucher.CreateDraft(
            command.VoucherDateUtc, "journal", AccountingVoucherSource.Manual, command.Narration, branchId: branchId);

        foreach (var line in command.Lines)
        {
            voucher.AddLine(line.AccountId, line.Description, line.DebitAmount, line.CreditAmount);
        }

        dbContext.Vouchers.Add(voucher);
        await dbContext.SaveChangesAsync(cancellationToken).ConfigureAwait(false);
        return voucher.Id;
    }
}

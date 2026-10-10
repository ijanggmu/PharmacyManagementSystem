using FSH.Framework.Core.Context;
using FSH.Modules.Accounting.Contracts.Services;
using FSH.Modules.Accounting.Contracts.v1.Banking;
using FSH.Modules.Accounting.Data;
using FSH.Modules.Accounting.Domain;
using FSH.Modules.Accounting.Services;
using FSH.Modules.Multitenancy.Contracts;
using Mediator;
using Microsoft.EntityFrameworkCore;

namespace FSH.Modules.Accounting.Features.v1.Banking.ReconcileBankAccount;

public sealed class ReconcileBankAccountCommandHandler(
    AccountingDbContext dbContext,
    ICurrentUser currentUser,
    ICurrentBranch currentBranch) : ICommandHandler<ReconcileBankAccountCommand, Guid>
{
    public async ValueTask<Guid> Handle(ReconcileBankAccountCommand command, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(command);

        var bankAccount = await dbContext.Accounts
            .AsNoTracking()
            .FirstOrDefaultAsync(a => a.Code == AccountingSystemAccountCodes.Bank, cancellationToken)
            .ConfigureAwait(false);

        // The reconciliation is stamped to the caller's branch, so its GL balance is that branch's bank
        // postings (vouchers without a branch are legacy, attributed to the default branch by the seeder).
        Guid? branchId = await currentBranch.GetBranchIdAsync(cancellationToken).ConfigureAwait(false);

        decimal glBalance = 0m;
        if (bankAccount is not null)
        {
            var totals = await (
                from line in dbContext.VoucherLines.AsNoTracking()
                join voucher in dbContext.LedgerVouchers() on line.VoucherId equals voucher.Id
                where line.AccountId == bankAccount.Id
                    && voucher.VoucherDateUtc <= command.AsOfUtc
                    && (branchId == null || voucher.BranchId == branchId)
                select new { line.DebitAmount, line.CreditAmount })
                .ToListAsync(cancellationToken)
                .ConfigureAwait(false);
            glBalance = totals.Sum(t => t.DebitAmount) - totals.Sum(t => t.CreditAmount);
        }

        var reconciliation = BankReconciliation.Create(
            command.AsOfUtc, glBalance, command.StatementBalance, command.Notes,
            currentUser.Name ?? currentUser.GetUserId().ToString(), branchId);

        dbContext.BankReconciliations.Add(reconciliation);
        await dbContext.SaveChangesAsync(cancellationToken).ConfigureAwait(false);

        return reconciliation.Id;
    }
}

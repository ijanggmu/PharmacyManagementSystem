using System.Net;
using FSH.Framework.Core.Context;
using FSH.Framework.Core.Exceptions;
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

        // The selected cash/bank account, or Bank (1010) when none is given (callers from before the selector).
        var bankAccount = command.AccountId is { } accountId
            ? await dbContext.Accounts
                .AsNoTracking()
                .FirstOrDefaultAsync(a => a.Id == accountId, cancellationToken)
                .ConfigureAwait(false)
                ?? throw new NotFoundException($"Account {accountId} not found.")
            : await dbContext.Accounts
                .AsNoTracking()
                .FirstOrDefaultAsync(a => a.Code == AccountingSystemAccountCodes.Bank, cancellationToken)
                .ConfigureAwait(false);

        if (bankAccount is not null
            && (bankAccount.AccountType != AccountingAccountType.Asset || !PaymentAccountTargets.IsCashBankCode(bankAccount.Code)))
        {
            throw new CustomException(
                $"Account {bankAccount.Code} {bankAccount.Name} isn't a cash or bank account — only 10xx cash & bank accounts can be reconciled here.",
                (IEnumerable<string>?)null, HttpStatusCode.BadRequest);
        }

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
            currentUser.Name ?? currentUser.GetUserId().ToString(), branchId, bankAccount?.Id);

        dbContext.BankReconciliations.Add(reconciliation);
        await dbContext.SaveChangesAsync(cancellationToken).ConfigureAwait(false);

        return reconciliation.Id;
    }
}

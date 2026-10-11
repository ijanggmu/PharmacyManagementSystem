using FSH.Framework.Core.Context;
using FSH.Modules.Accounting.Contracts.Services;
using FSH.Modules.Accounting.Contracts.v1.Banking;
using FSH.Modules.Accounting.Data;
using FSH.Modules.Accounting.Domain;
using FSH.Modules.Accounting.Services;
using FSH.Modules.Multitenancy.Contracts;
using Mediator;

namespace FSH.Modules.Accounting.Features.v1.Banking.RecordBankDeposit;

/// <summary>Records a cash-to-bank deposit and posts its voucher (Dr Bank / Cr Cash, dated at the deposit
/// date) in one transaction. A deposit dated in a locked period is refused.</summary>
public sealed class RecordBankDepositCommandHandler(
    AccountingDbContext dbContext,
    IVoucherPostingService voucherPostingService,
    IAccountingAccountResolver accountResolver,
    ICurrentUser currentUser,
    ICurrentBranch currentBranch,
    AccountingPostingLockService postingLockService) : ICommandHandler<RecordBankDepositCommand, Guid>
{
    public async ValueTask<Guid> Handle(RecordBankDepositCommand command, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(command);

        await postingLockService.AssertPostingOpenAsync(command.DepositDateUtc, cancellationToken).ConfigureAwait(false);

        // BankDeposit is a transactional entity (docs/branch-scoping-plan.md §2) — always
        // attributed to exactly one branch, never left unscoped.
        Guid branchId = await currentBranch.RequireBranchIdAsync(cancellationToken).ConfigureAwait(false);

        var bankId = await accountResolver.ResolveByCodeAsync(AccountingSystemAccountCodes.Bank, cancellationToken).ConfigureAwait(false);
        var cashId = await accountResolver.ResolveByCodeAsync(AccountingSystemAccountCodes.Cash, cancellationToken).ConfigureAwait(false);

        return await AccountingTransaction.RunAsync(dbContext, async () =>
        {
            var deposit = BankDeposit.Create(
                command.DepositDateUtc, command.Amount, command.Description,
                currentUser.Name ?? currentUser.GetUserId().ToString(), branchId);

            dbContext.BankDeposits.Add(deposit);
            await dbContext.SaveChangesAsync(cancellationToken).ConfigureAwait(false);

            await voucherPostingService.PostSystemVoucherAsync(
                new PostVoucherRequest(
                    VoucherType: "system_bank_deposit",
                    ReferenceType: "BankDeposit",
                    ReferenceId: deposit.Id,
                    Narration: "Bank deposit" + (command.Description is null ? "" : $" — {command.Description}"),
                    Lines:
                    [
                        new PostVoucherLine(bankId, "Cash deposited", DebitAmount: command.Amount, CreditAmount: 0m),
                        new PostVoucherLine(cashId, "Deposited to bank", DebitAmount: 0m, CreditAmount: command.Amount),
                    ],
                    BranchId: branchId,
                    VoucherDateUtc: command.DepositDateUtc),
                cancellationToken).ConfigureAwait(false);

            return deposit.Id;
        }, cancellationToken).ConfigureAwait(false);
    }
}

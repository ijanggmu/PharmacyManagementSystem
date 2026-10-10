using FSH.Framework.Core.Context;
using FSH.Modules.Accounting.Contracts.Services;
using FSH.Modules.Accounting.Contracts.v1.Banking;
using FSH.Modules.Accounting.Data;
using FSH.Modules.Accounting.Domain;
using FSH.Modules.Multitenancy.Contracts;
using Mediator;

namespace FSH.Modules.Accounting.Features.v1.Banking.RecordBankDeposit;

public sealed class RecordBankDepositCommandHandler(
    AccountingDbContext dbContext,
    IVoucherPostingService voucherPostingService,
    IAccountingAccountResolver accountResolver,
    ICurrentUser currentUser,
    ICurrentBranch currentBranch) : ICommandHandler<RecordBankDepositCommand, Guid>
{
    public async ValueTask<Guid> Handle(RecordBankDepositCommand command, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(command);

        // BankDeposit is a transactional entity (docs/branch-scoping-plan.md §2) — always
        // attributed to exactly one branch, never left unscoped.
        Guid branchId = await currentBranch.RequireBranchIdAsync(cancellationToken).ConfigureAwait(false);

        var deposit = BankDeposit.Create(
            command.DepositDateUtc, command.Amount, command.Description,
            currentUser.Name ?? currentUser.GetUserId().ToString(), branchId);

        dbContext.BankDeposits.Add(deposit);
        await dbContext.SaveChangesAsync(cancellationToken).ConfigureAwait(false);

        var bankId = await accountResolver.ResolveByCodeAsync(AccountingSystemAccountCodes.Bank, cancellationToken).ConfigureAwait(false);
        var cashId = await accountResolver.ResolveByCodeAsync(AccountingSystemAccountCodes.Cash, cancellationToken).ConfigureAwait(false);

        await voucherPostingService.PostSystemVoucherAsync(
            new PostVoucherRequest(
                VoucherType: "system_bank_deposit",
                ReferenceType: "BankDeposit",
                ReferenceId: deposit.Id,
                Narration: $"Bank deposit" + (command.Description is null ? "" : $" — {command.Description}"),
                Lines:
                [
                    new PostVoucherLine(bankId, "Cash deposited", DebitAmount: command.Amount, CreditAmount: 0m),
                    new PostVoucherLine(cashId, "Deposited to bank", DebitAmount: 0m, CreditAmount: command.Amount),
                ],
                BranchId: branchId),
            cancellationToken).ConfigureAwait(false);

        return deposit.Id;
    }
}

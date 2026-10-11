using FSH.Framework.Core.Context;
using FSH.Modules.Accounting.Contracts.Services;
using FSH.Modules.Accounting.Contracts.v1.Expenses;
using FSH.Modules.Accounting.Data;
using FSH.Modules.Accounting.Domain;
using FSH.Modules.Accounting.Services;
using FSH.Modules.Multitenancy.Contracts;
using Mediator;

namespace FSH.Modules.Accounting.Features.v1.Expenses.RecordExpense;

public sealed class RecordExpenseCommandHandler(
    AccountingDbContext dbContext,
    IVoucherPostingService voucherPostingService,
    IAccountingAccountResolver accountResolver,
    ICurrentUser currentUser,
    ICurrentBranch currentBranch) : ICommandHandler<RecordExpenseCommand, Guid>
{
    public async ValueTask<Guid> Handle(RecordExpenseCommand command, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(command);

        // Expense keeps BranchId nullable (docs/branch-scoping-plan.md §2: ledger/reporting entity).
        Guid? branchId = await currentBranch.GetBranchIdAsync(cancellationToken).ConfigureAwait(false);

        var expense = Expense.Create(
            command.ExpenseDateUtc, command.Category, command.Amount, command.PaymentMethod, command.Description,
            currentUser.Name ?? currentUser.GetUserId().ToString(), branchId, command.ReceiptReference);

        dbContext.Expenses.Add(expense);
        await dbContext.SaveChangesAsync(cancellationToken).ConfigureAwait(false);

        var expenseAccountId = await accountResolver.ResolveByCodeAsync(AccountingSystemAccountCodes.GeneralExpenses, cancellationToken).ConfigureAwait(false);
        string paymentAccountCode = PaymentMethodAccounts.AccountCodeFor(command.PaymentMethod);
        var paymentAccountId = await accountResolver.ResolveByCodeAsync(paymentAccountCode, cancellationToken).ConfigureAwait(false);

        await voucherPostingService.PostSystemVoucherAsync(
            new PostVoucherRequest(
                VoucherType: "system_expense",
                ReferenceType: "Expense",
                ReferenceId: expense.Id,
                Narration: ExpenseNarration.Build(expense),
                Lines:
                [
                    new PostVoucherLine(expenseAccountId, command.Category, DebitAmount: command.Amount, CreditAmount: 0m),
                    new PostVoucherLine(paymentAccountId, "Expense paid", DebitAmount: 0m, CreditAmount: command.Amount),
                ],
                BranchId: branchId),
            cancellationToken).ConfigureAwait(false);

        return expense.Id;
    }
}

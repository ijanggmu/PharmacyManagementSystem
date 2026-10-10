using FSH.Framework.Core.Context;
using FSH.Framework.Core.Exceptions;
using FSH.Modules.Accounting.Contracts.Services;
using FSH.Modules.Accounting.Contracts.v1.Expenses;
using FSH.Modules.Accounting.Data;
using FSH.Modules.Accounting.Services;
using Mediator;
using Microsoft.EntityFrameworkCore;

namespace FSH.Modules.Accounting.Features.v1.Expenses.UpdateExpense;

public sealed class UpdateExpenseCommandHandler(
    AccountingDbContext dbContext,
    IVoucherPostingService voucherPostingService,
    IAccountingAccountResolver accountResolver,
    ICurrentUser currentUser) : ICommandHandler<UpdateExpenseCommand, Guid>
{
    public async ValueTask<Guid> Handle(UpdateExpenseCommand command, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(command);

        var expense = await dbContext.Expenses
            .FirstOrDefaultAsync(e => e.Id == command.ExpenseId, cancellationToken)
            .ConfigureAwait(false)
            ?? throw new NotFoundException($"Expense {command.ExpenseId} not found.");

        string actor = currentUser.Name ?? currentUser.GetUserId().ToString();

        // Reverse the original GL voucher (if any) before touching the figures — the reversed
        // voucher stays on the books for a full audit trail (rule.md §9.1) rather than being
        // edited in place.
        var existingVoucherId = await voucherPostingService
            .FindPostedVoucherIdAsync("Expense", expense.Id, cancellationToken)
            .ConfigureAwait(false);
        if (existingVoucherId is { } voucherId)
        {
            await voucherPostingService.ReverseAsync(voucherId, actor, cancellationToken: cancellationToken).ConfigureAwait(false);
        }

        expense.Update(command.Category, command.Amount, command.PaymentMethod, command.Description, command.ReceiptReference);
        await dbContext.SaveChangesAsync(cancellationToken).ConfigureAwait(false);

        var expenseAccountId = await accountResolver
            .ResolveByCodeAsync(AccountingSystemAccountCodes.GeneralExpenses, cancellationToken)
            .ConfigureAwait(false);
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
                // Re-posted voucher keeps the expense's original branch — Update() never changes it.
                BranchId: expense.BranchId),
            cancellationToken).ConfigureAwait(false);

        return expense.Id;
    }
}

using FSH.Framework.Core.Context;
using FSH.Framework.Core.Exceptions;
using FSH.Modules.Accounting.Contracts.Services;
using FSH.Modules.Accounting.Contracts.v1.Expenses;
using FSH.Modules.Accounting.Data;
using FSH.Modules.Accounting.Services;
using FSH.Modules.Multitenancy.Contracts;
using Mediator;
using Microsoft.EntityFrameworkCore;

namespace FSH.Modules.Accounting.Features.v1.Expenses.UpdateExpense;

/// <summary>
/// Reverses the expense's voucher, updates the row and posts a replacement voucher, all in one transaction —
/// a failure part-way can't leave the expense changed with its old voucher reversed and no new one posted.
/// <para>The reversal is dated at the expense's ORIGINAL date (the first open day when that is locked) and the
/// replacement at the (possibly new) expense date, so the period the expense belongs to shows only the
/// updated figure. Dating the reversal "now" left both the old and the new voucher in the expense's period
/// until the edit date — the expense counted twice.</para>
/// </summary>
public sealed class UpdateExpenseCommandHandler(
    AccountingDbContext dbContext,
    VoucherPostingService voucherPostingService,
    IAccountingAccountResolver accountResolver,
    IPaymentMethodAccountResolver paymentAccounts,
    ICurrentUser currentUser,
    ICurrentBranch currentBranch,
    AccountingPostingLockService postingLockService) : ICommandHandler<UpdateExpenseCommand, Guid>
{
    public async ValueTask<Guid> Handle(UpdateExpenseCommand command, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(command);

        var expense = await dbContext.Expenses
            .FirstOrDefaultAsync(e => e.Id == command.ExpenseId, cancellationToken)
            .ConfigureAwait(false)
            ?? throw new NotFoundException($"Expense {command.ExpenseId} not found.");

        await currentBranch.EnsureCanSeeBranchAsync(expense.BranchId, $"Expense {command.ExpenseId} not found.", cancellationToken).ConfigureAwait(false);

        // Moving the expense to another date: like recording one, the new date must be in an open period
        // (the user picked it, unlike a system event's date).
        bool moved = command.ExpenseDateUtc is { } newDate && newDate != expense.ExpenseDateUtc;
        if (moved)
        {
            await postingLockService.AssertPostingOpenAsync(command.ExpenseDateUtc!.Value, cancellationToken).ConfigureAwait(false);
        }

        string actor = currentUser.Name ?? currentUser.GetUserId().ToString();

        var expenseAccountId = await accountResolver
            .ResolveByCodeAsync(AccountingSystemAccountCodes.GeneralExpenses, cancellationToken)
            .ConfigureAwait(false);
        var paymentAccountId = await paymentAccounts.ResolveAccountIdAsync(command.PaymentMethod, cancellationToken).ConfigureAwait(false);

        return await AccountingTransaction.RunAsync(dbContext, async () =>
        {
            // Reverse the original GL voucher (if any) before touching the figures — the reversed
            // voucher stays on the books for a full audit trail (rule.md §9.1) rather than being
            // edited in place. Dated at the expense's original date (never before the voucher itself).
            var existingVoucherId = await voucherPostingService
                .FindPostedVoucherIdAsync("Expense", expense.Id, cancellationToken)
                .ConfigureAwait(false);
            if (existingVoucherId is { } voucherId)
            {
                await voucherPostingService
                    .ReverseOwnedSystemVoucherAsync(voucherId, actor, expense.ExpenseDateUtc, "expense edited", cancellationToken)
                    .ConfigureAwait(false);
            }

            expense.Update(command.Category, command.Amount, command.PaymentMethod, command.Description, command.ReceiptReference);
            if (moved)
            {
                expense.MoveTo(command.ExpenseDateUtc!.Value);
            }

            await dbContext.SaveChangesAsync(cancellationToken).ConfigureAwait(false);

            await voucherPostingService.RepostSystemVoucherAsync(
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
                    BranchId: expense.BranchId,
                    VoucherDateUtc: expense.ExpenseDateUtc),
                cancellationToken).ConfigureAwait(false);

            return expense.Id;
        }, cancellationToken).ConfigureAwait(false);
    }
}

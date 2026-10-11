using FSH.Framework.Core.Context;
using FSH.Framework.Core.Exceptions;
using FSH.Modules.Accounting.Contracts.Services;
using FSH.Modules.Accounting.Contracts.v1.Expenses;
using FSH.Modules.Accounting.Data;
using Mediator;
using Microsoft.EntityFrameworkCore;

namespace FSH.Modules.Accounting.Features.v1.Expenses.DeleteExpense;

public sealed class DeleteExpenseCommandHandler(
    AccountingDbContext dbContext, IVoucherPostingService voucherPostingService, ICurrentUser currentUser)
    : ICommandHandler<DeleteExpenseCommand, Guid>
{
    public async ValueTask<Guid> Handle(DeleteExpenseCommand command, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(command);

        var expense = await dbContext.Expenses
            .FirstOrDefaultAsync(e => e.Id == command.ExpenseId, cancellationToken)
            .ConfigureAwait(false)
            ?? throw new NotFoundException($"Expense {command.ExpenseId} not found.");

        // Reverse the posted voucher first — otherwise deleting the expense row leaves a GL entry
        // with nothing behind it, understating net profit forever (mirrors deleteExpenseForTenant
        // in the Next.js lib/server/services/expense-service.ts).
        var existingVoucherId = await voucherPostingService
            .FindPostedVoucherIdAsync("Expense", expense.Id, cancellationToken)
            .ConfigureAwait(false);
        if (existingVoucherId is { } voucherId)
        {
            string actor = currentUser.Name ?? currentUser.GetUserId().ToString();
            await voucherPostingService.ReverseAsync(voucherId, actor, cancellationToken: cancellationToken).ConfigureAwait(false);
        }

        dbContext.Expenses.Remove(expense);
        await dbContext.SaveChangesAsync(cancellationToken).ConfigureAwait(false);

        return expense.Id;
    }
}

using System.Diagnostics;
using System.Net;
using FSH.Framework.Core.Context;
using FSH.Framework.Core.Exceptions;
using FSH.Framework.Eventing.Abstractions;
using FSH.Modules.Accounting.Contracts.Events;
using FSH.Modules.Accounting.Contracts.Services;
using FSH.Modules.Accounting.Contracts.v1.Expenses;
using FSH.Modules.Accounting.Data;
using FSH.Modules.Accounting.Domain;
using FSH.Modules.Accounting.Services;
using FSH.Modules.Multitenancy.Contracts;
using FSH.Modules.Suppliers.Contracts.v1.Ledger;
using Mediator;
using Microsoft.EntityFrameworkCore;

namespace FSH.Modules.Accounting.Features.v1.Expenses.DeleteExpense;

/// <summary>
/// Reverses the expense's voucher and removes the row in one transaction. For a pay-later expense it also raises
/// <see cref="ExpenseBillVoidedIntegrationEvent"/> (same transaction, via the outbox) so Suppliers credits the bill
/// back on the supplier's AP ledger. A pay-later expense whose bill already has a payment or credit allocated to it
/// is refused: reversing it would leave that payment as an unexplained advance on the supplier's account.
/// </summary>
public sealed class DeleteExpenseCommandHandler(
    AccountingDbContext dbContext,
    VoucherPostingService voucherPostingService,
    ICurrentUser currentUser,
    ICurrentBranch currentBranch,
    IMediator mediator,
    IOutboxWriter outbox)
    : ICommandHandler<DeleteExpenseCommand, Guid>
{
    public async ValueTask<Guid> Handle(DeleteExpenseCommand command, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(command);

        var expense = await dbContext.Expenses
            .FirstOrDefaultAsync(e => e.Id == command.ExpenseId, cancellationToken)
            .ConfigureAwait(false)
            ?? throw new NotFoundException($"Expense {command.ExpenseId} not found.");

        await currentBranch.EnsureCanSeeBranchAsync(expense.BranchId, $"Expense {command.ExpenseId} not found.", cancellationToken).ConfigureAwait(false);

        if (expense.SupplierId is { } supplierId)
        {
            await EnsureBillUnsettledAsync(expense, supplierId, cancellationToken).ConfigureAwait(false);
        }

        return await AccountingTransaction.RunAsync(dbContext, async () =>
        {
            // Reverse the posted voucher first — otherwise deleting the expense row leaves a GL entry
            // with nothing behind it, understating net profit forever (mirrors deleteExpenseForTenant
            // in the Next.js lib/server/services/expense-service.ts).
            DateTime deletedAtUtc = DateTime.UtcNow;
            var existingVoucherId = await voucherPostingService
                .FindPostedVoucherIdAsync("Expense", expense.Id, cancellationToken)
                .ConfigureAwait(false);
            if (existingVoucherId is { } voucherId)
            {
                string actor = currentUser.Name ?? currentUser.GetUserId().ToString();
                // Dated at the deletion (never before the voucher itself; the first open day when locked).
                await voucherPostingService
                    .ReverseOwnedSystemVoucherAsync(voucherId, actor, deletedAtUtc, "expense deleted", cancellationToken)
                    .ConfigureAwait(false);
            }

            dbContext.Expenses.Remove(expense);
            await dbContext.SaveChangesAsync(cancellationToken).ConfigureAwait(false);

            if (expense.SupplierId is { } owedTo)
            {
                await outbox.AddAsync(new ExpenseBillVoidedIntegrationEvent(
                    Id: Guid.NewGuid(),
                    OccurredOnUtc: deletedAtUtc,
                    TenantId: currentUser.GetTenant(),
                    CorrelationId: Activity.Current?.Id ?? Guid.NewGuid().ToString(),
                    Source: "Accounting",
                    ExpenseId: expense.Id,
                    SupplierId: owedTo,
                    Amount: expense.Amount,
                    VoidedAtUtc: deletedAtUtc,
                    Reason: "expense deleted",
                    BillNumber: expense.ReceiptReference,
                    BranchId: expense.BranchId), cancellationToken).ConfigureAwait(false);
            }

            return expense.Id;
        }, cancellationToken).ConfigureAwait(false);
    }

    /// <summary>Refuses to delete a pay-later expense once anything is allocated to its bill on the supplier's ledger.
    /// A bill not on the ledger yet (its event still queued) has nothing allocated, so the delete goes ahead and the
    /// void event, queued after it, credits it back.</summary>
    private async ValueTask EnsureBillUnsettledAsync(Expense expense, Guid supplierId, CancellationToken cancellationToken)
    {
        var bills = await mediator
            .Send(new GetSupplierOpenBillsQuery(supplierId, OnlyOpen: false), cancellationToken)
            .ConfigureAwait(false);
        var bill = bills.Bills.FirstOrDefault(b =>
            string.Equals(b.ReferenceType, ExpenseBillReference.ReferenceType, StringComparison.Ordinal) && b.ReferenceId == expense.Id);
        if (bill is { } settled && settled.Paid + settled.Credited > 0)
        {
            throw new CustomException(
                $"This expense's bill has already been paid (fully or in part) through the supplier's account " +
                $"({settled.Paid + settled.Credited:0.00} of {settled.Amount:0.00}), so it can't be deleted. " +
                "Settle the difference with the supplier instead.",
                (IEnumerable<string>?)null, HttpStatusCode.Conflict);
        }
    }
}

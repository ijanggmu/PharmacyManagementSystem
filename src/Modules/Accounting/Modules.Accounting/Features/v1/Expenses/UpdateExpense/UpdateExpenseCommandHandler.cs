using System.Net;
using FSH.Framework.Core.Context;
using FSH.Framework.Core.Exceptions;
using FSH.Modules.Accounting.Contracts.Services;
using FSH.Modules.Accounting.Contracts.v1.Expenses;
using FSH.Modules.Accounting.Data;
using FSH.Modules.Accounting.Services;
using FSH.Modules.Multitenancy.Contracts;
using FSH.Modules.Suppliers.Contracts.v1.Suppliers;
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
/// <para>A pay-later expense's bill is on the supplier's AP ledger, so its supplier, gross amount and date are fixed
/// (delete and re-record to change them); its account, category, VAT split and texts can still change — the
/// replacement voucher credits Accounts Payable with the same gross, leaving the payable untouched. An edit can't
/// switch an expense between paid now and pay later.</para>
/// </summary>
public sealed class UpdateExpenseCommandHandler(
    AccountingDbContext dbContext,
    VoucherPostingService voucherPostingService,
    IAccountingAccountResolver accountResolver,
    IPaymentMethodAccountResolver paymentAccounts,
    ICurrentUser currentUser,
    ICurrentBranch currentBranch,
    AccountingPostingLockService postingLockService,
    IMediator mediator) : ICommandHandler<UpdateExpenseCommand, Guid>
{
    public async ValueTask<Guid> Handle(UpdateExpenseCommand command, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(command);

        var expense = await dbContext.Expenses
            .FirstOrDefaultAsync(e => e.Id == command.ExpenseId, cancellationToken)
            .ConfigureAwait(false)
            ?? throw new NotFoundException($"Expense {command.ExpenseId} not found.");

        await currentBranch.EnsureCanSeeBranchAsync(expense.BranchId, $"Expense {command.ExpenseId} not found.", cancellationToken).ConfigureAwait(false);

        bool moved = command.ExpenseDateUtc is { } newDate && newDate != expense.ExpenseDateUtc;
        EnsureSettlementUnchanged(expense, command, moved);

        // Moving the expense to another date: like recording one, the new date must be in an open period
        // (the user picked it, unlike a system event's date).
        if (moved)
        {
            await postingLockService.AssertPostingOpenAsync(command.ExpenseDateUtc!.Value, cancellationToken).ConfigureAwait(false);
        }

        string actor = currentUser.Name ?? currentUser.GetUserId().ToString();

        // Omitted account = keep the current one (General Expenses for an expense recorded before accounts could be chosen).
        var expenseAccountId = await ExpensePosting
            .ResolveExpenseAccountAsync(dbContext, accountResolver, command.ExpenseAccountId ?? expense.ExpenseAccountId, cancellationToken)
            .ConfigureAwait(false);
        decimal vatAmount = await ExpensePosting
            .ResolveVatAsync(command.Amount, command.VatAmount, command.AmountIncludesVat, mediator, cancellationToken)
            .ConfigureAwait(false);

        string? supplierVatNumber = command.SupplierVatNumber;
        if (vatAmount > 0 && string.IsNullOrWhiteSpace(supplierVatNumber) && expense.SupplierId is { } supplierId)
        {
            supplierVatNumber = expense.SupplierVatNumber
                ?? (await mediator.Send(new GetSupplierByIdQuery(supplierId), cancellationToken).ConfigureAwait(false)).TaxId;
        }

        ExpensePosting.EnsureVatBillDetails(vatAmount, command.Amount, supplierVatNumber, command.ReceiptReference);

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

            expense.Update(
                command.Category, command.Amount, command.PaymentMethod, command.Description, command.ReceiptReference,
                expenseAccountId, vatAmount, supplierVatNumber, command.VendorName);
            if (moved)
            {
                expense.MoveTo(command.ExpenseDateUtc!.Value);
            }

            await dbContext.SaveChangesAsync(cancellationToken).ConfigureAwait(false);

            var creditAccountId = await ExpensePosting.ResolveCreditAccountAsync(expense, accountResolver, paymentAccounts, cancellationToken).ConfigureAwait(false);
            var inputVatAccountId = await ExpensePosting.ResolveInputVatAccountAsync(expense, accountResolver, cancellationToken).ConfigureAwait(false);

            await voucherPostingService.RepostSystemVoucherAsync(
                new PostVoucherRequest(
                    VoucherType: "system_expense",
                    ReferenceType: "Expense",
                    ReferenceId: expense.Id,
                    Narration: ExpenseNarration.Build(expense),
                    Lines: ExpensePosting.BuildLines(expense, expenseAccountId, inputVatAccountId, creditAccountId),
                    // Re-posted voucher keeps the expense's original branch — Update() never changes it.
                    BranchId: expense.BranchId,
                    VoucherDateUtc: expense.ExpenseDateUtc),
                cancellationToken).ConfigureAwait(false);

            return expense.Id;
        }, cancellationToken).ConfigureAwait(false);
    }

    /// <summary>Refuses edits that would move a payable: switching between paid now and pay later, another supplier,
    /// or a new amount or date on a pay-later expense (its bill is already on the supplier's ledger).</summary>
    private static void EnsureSettlementUnchanged(Domain.Expense expense, UpdateExpenseCommand command, bool moved)
    {
        if (expense.SupplierId != command.SupplierId)
        {
            throw new CustomException(
                expense.IsOnCredit && command.SupplierId is not null
                    ? "A pay-later expense stays owed to its supplier — delete it and record it again for another supplier."
                    : "An edit can't switch an expense between paid now and pay later — delete it and record it again.",
                (IEnumerable<string>?)null, HttpStatusCode.Conflict);
        }

        if (expense.IsOnCredit && (command.Amount != expense.Amount || moved))
        {
            throw new CustomException(
                "The amount and date of a pay-later expense are on the supplier's ledger and can't be edited — delete it and record it again.",
                (IEnumerable<string>?)null, HttpStatusCode.Conflict);
        }
    }
}

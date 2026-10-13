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
using FSH.Modules.Suppliers.Contracts.v1.Suppliers;
using Mediator;

namespace FSH.Modules.Accounting.Features.v1.Expenses.RecordExpense;

/// <summary>Records an expense and posts its voucher (dated at the expense date) in one transaction, so an
/// expense never exists without its GL entry. An expense dated in a locked period is refused.
/// <para>Dr the chosen expense account (net) + Dr Input VAT Recoverable (VAT bill) / Cr Cash or Bank (paid now) or
/// Cr Accounts Payable (pay later). A pay-later expense also raises <see cref="ExpenseBillRecordedIntegrationEvent"/>
/// through the outbox, in the same transaction, so Suppliers adds the bill to the supplier's AP ledger.</para></summary>
public sealed class RecordExpenseCommandHandler(
    AccountingDbContext dbContext,
    IVoucherPostingService voucherPostingService,
    IAccountingAccountResolver accountResolver,
    ICurrentUser currentUser,
    ICurrentBranch currentBranch,
    AccountingPostingLockService postingLockService,
    IMediator mediator,
    IOutboxWriter outbox) : ICommandHandler<RecordExpenseCommand, Guid>
{
    public async ValueTask<Guid> Handle(RecordExpenseCommand command, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(command);

        await postingLockService.AssertPostingOpenAsync(command.ExpenseDateUtc, cancellationToken).ConfigureAwait(false);

        // Expense keeps BranchId nullable (docs/branch-scoping-plan.md §2: ledger/reporting entity).
        Guid? branchId = await currentBranch.GetBranchIdAsync(cancellationToken).ConfigureAwait(false);

        var expenseAccountId = await ExpensePosting
            .ResolveExpenseAccountAsync(dbContext, accountResolver, command.ExpenseAccountId, cancellationToken)
            .ConfigureAwait(false);
        decimal vatAmount = await ExpensePosting
            .ResolveVatAsync(command.Amount, command.VatAmount, command.AmountIncludesVat, mediator, cancellationToken)
            .ConfigureAwait(false);

        string? vendorName = command.VendorName;
        string? supplierVatNumber = command.SupplierVatNumber;
        if (command.SupplierId is { } supplierId)
        {
            // Pay later: the bill goes on this supplier's AP ledger, so the supplier must exist and be active.
            var supplier = await mediator.Send(new GetSupplierByIdQuery(supplierId), cancellationToken).ConfigureAwait(false);
            if (!supplier.IsActive || supplier.DeletedOnUtc is not null)
            {
                throw new CustomException(
                    $"Supplier {supplier.Name} is inactive — choose an active supplier or record the expense as paid.",
                    (IEnumerable<string>?)null, HttpStatusCode.BadRequest);
            }

            vendorName = supplier.Name;
            if (string.IsNullOrWhiteSpace(supplierVatNumber))
            {
                supplierVatNumber = supplier.TaxId;
            }
        }

        ExpensePosting.EnsureVatBillDetails(vatAmount, command.Amount, supplierVatNumber, command.ReceiptReference);

        string actor = currentUser.Name ?? currentUser.GetUserId().ToString();
        var expense = Expense.Create(
            command.ExpenseDateUtc, command.Category, command.Amount, command.PaymentMethod, command.Description,
            actor, branchId, command.ReceiptReference, expenseAccountId, vatAmount,
            supplierVatNumber, vendorName, command.SupplierId);

        var creditAccountId = await ExpensePosting.ResolveCreditAccountAsync(expense, accountResolver, cancellationToken).ConfigureAwait(false);
        var inputVatAccountId = await ExpensePosting.ResolveInputVatAccountAsync(expense, accountResolver, cancellationToken).ConfigureAwait(false);

        return await AccountingTransaction.RunAsync(dbContext, async () =>
        {
            dbContext.Expenses.Add(expense);
            await dbContext.SaveChangesAsync(cancellationToken).ConfigureAwait(false);

            await voucherPostingService.PostSystemVoucherAsync(
                new PostVoucherRequest(
                    VoucherType: "system_expense",
                    ReferenceType: "Expense",
                    ReferenceId: expense.Id,
                    Narration: ExpenseNarration.Build(expense),
                    Lines: ExpensePosting.BuildLines(expense, expenseAccountId, inputVatAccountId, creditAccountId),
                    BranchId: branchId,
                    VoucherDateUtc: expense.ExpenseDateUtc),
                cancellationToken).ConfigureAwait(false);

            if (expense.SupplierId is { } owedTo)
            {
                await outbox.AddAsync(new ExpenseBillRecordedIntegrationEvent(
                    Id: Guid.NewGuid(),
                    OccurredOnUtc: DateTime.UtcNow,
                    TenantId: currentUser.GetTenant(),
                    CorrelationId: Activity.Current?.Id ?? Guid.NewGuid().ToString(),
                    Source: "Accounting",
                    ExpenseId: expense.Id,
                    SupplierId: owedTo,
                    Amount: expense.Amount,
                    ExpenseDateUtc: expense.ExpenseDateUtc,
                    Category: expense.Category,
                    BillNumber: expense.ReceiptReference,
                    Description: expense.Description,
                    BranchId: branchId), cancellationToken).ConfigureAwait(false);
            }

            return expense.Id;
        }, cancellationToken).ConfigureAwait(false);
    }
}

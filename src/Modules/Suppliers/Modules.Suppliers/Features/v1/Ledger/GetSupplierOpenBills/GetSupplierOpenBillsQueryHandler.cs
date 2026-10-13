using FSH.Framework.Core.Exceptions;
using FSH.Modules.Multitenancy.Contracts;
using FSH.Modules.Suppliers.Contracts.Dtos;
using FSH.Modules.Suppliers.Contracts.v1.Ledger;
using FSH.Modules.Suppliers.Data;
using FSH.Modules.Suppliers.Domain;
using FSH.Modules.Suppliers.Services;
using Mediator;
using Microsoft.EntityFrameworkCore;

namespace FSH.Modules.Suppliers.Features.v1.Ledger.GetSupplierOpenBills;

public sealed class GetSupplierOpenBillsQueryHandler(SuppliersDbContext dbContext, ICurrentBranch currentBranch)
    : IQueryHandler<GetSupplierOpenBillsQuery, SupplierOpenBillsDto>
{
    public async ValueTask<SupplierOpenBillsDto> Handle(GetSupplierOpenBillsQuery query, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(query);

        var supplier = await dbContext.Suppliers
            .AsNoTracking()
            .Where(s => s.Id == query.SupplierId)
            .Select(s => new { s.CreditDays })
            .FirstOrDefaultAsync(cancellationToken)
            .ConfigureAwait(false)
            ?? throw new NotFoundException($"Supplier {query.SupplierId} not found.");

        Guid? branchFilter = await currentBranch.ResolveListBranchFilterAsync(query.BranchId, cancellationToken).ConfigureAwait(false);

        var allocation = await SupplierBillAllocator.AllocateForSupplierAsync(dbContext, query.SupplierId, cancellationToken)
            .ConfigureAwait(false);

        DateTime now = DateTime.UtcNow;
        var bills = allocation.Bills
            .Where(b => branchFilter == null || b.Entry.BranchId == branchFilter)
            .Where(b => !query.OnlyOpen || b.Outstanding > 0)
            .Select(b => ToDto(b, PaymentTerms.EffectiveDueDate(b.Entry.DueDateUtc, b.Entry.EntryDateUtc, supplier.CreditDays), now))
            .ToList();

        // Descriptions aren't part of the allocation projection; load them for the bills being returned.
        var ids = bills.Select(b => b.LedgerEntryId).ToList();
        var descriptions = await dbContext.SupplierLedgerEntries
            .AsNoTracking()
            .Where(e => ids.Contains(e.Id))
            .ToDictionaryAsync(e => e.Id, e => e.Description, cancellationToken)
            .ConfigureAwait(false);
        bills = bills.Select(b => b with { Description = descriptions.GetValueOrDefault(b.LedgerEntryId) }).ToList();

        return new SupplierOpenBillsDto(
            query.SupplierId,
            bills.Sum(b => b.Outstanding),
            allocation.UnappliedCredit,
            bills);
    }

    private static SupplierBillDto ToDto(SupplierBill b, DateTime? dueDateUtc, DateTime now) => new(
        b.Entry.Id,
        b.Entry.EntryDateUtc,
        b.Entry.EntryType.ToString(),
        b.ReferenceType,
        b.ReferenceId,
        b.Entry.DocumentNumber,
        b.Entry.SupplierBillNumber,
        null,
        b.Amount,
        b.Paid,
        b.Credited,
        b.Outstanding,
        StatusOf(b),
        Math.Max(0, (now - b.Entry.EntryDateUtc).Days),
        b.Entry.BranchId,
        dueDateUtc,
        // Only an unpaid bill can be overdue.
        dueDateUtc is { } due && b.Outstanding > 0 ? PaymentTerms.DaysOverdue(due, now) : null);

    private static string StatusOf(SupplierBill bill)
    {
        if (bill.Outstanding <= 0)
        {
            return "paid";
        }

        return bill.Paid + bill.Credited > 0 ? "partially_paid" : "open";
    }
}

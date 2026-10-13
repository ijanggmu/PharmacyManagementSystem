using FSH.Modules.Multitenancy.Contracts;
using FSH.Modules.Suppliers.Contracts.Dtos;
using FSH.Modules.Suppliers.Contracts.v1.Ledger;
using FSH.Modules.Suppliers.Data;
using FSH.Modules.Suppliers.Domain;
using FSH.Modules.Suppliers.Services;
using Mediator;
using Microsoft.EntityFrameworkCore;

namespace FSH.Modules.Suppliers.Features.v1.Ledger.GetPayablesDue;

/// <summary>
/// Open bills by due date. Settlement is the AP aging's (<see cref="SupplierBillAllocator"/> over each supplier's
/// whole account, then the branch filter), so the amounts here agree with the aging report and the open-bills list.
/// A bill stored without a due date is read with the supplier's current credit days (<see cref="PaymentTerms"/>).
/// </summary>
public sealed class GetPayablesDueQueryHandler(SuppliersDbContext dbContext, ICurrentBranch currentBranch)
    : IQueryHandler<GetPayablesDueQuery, PayablesDueDto>
{
    public async ValueTask<PayablesDueDto> Handle(GetPayablesDueQuery query, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(query);

        Guid? branchFilter = await currentBranch.ResolveListBranchFilterAsync(query.BranchId, cancellationToken).ConfigureAwait(false);

        var entries = await SupplierBillAllocator.LoadRowsAsync(dbContext, query.AsOfUtc, branchFilter, cancellationToken)
            .ConfigureAwait(false);
        if (entries.Count == 0)
        {
            return new PayablesDueDto(query.AsOfUtc, query.WithinDays, 0m, 0m, 0m, 0m, [], []);
        }

        var supplierIds = entries.Select(e => e.SupplierId).Distinct().ToList();
        var suppliers = await dbContext.Suppliers
            .AsNoTracking()
            .Where(s => supplierIds.Contains(s.Id))
            .Select(s => new { s.Id, s.Name, s.CreditDays })
            .ToDictionaryAsync(s => s.Id, cancellationToken)
            .ConfigureAwait(false);

        var bills = new List<PayableDueBillDto>();
        foreach (var group in entries.GroupBy(e => e.SupplierId))
        {
            var supplier = suppliers.GetValueOrDefault(group.Key);
            string name = supplier?.Name ?? "(unknown)";
            foreach (var bill in SupplierBillAllocator.Allocate(group).Bills)
            {
                if (bill.Outstanding <= 0 || (branchFilter is { } onlyBranch && bill.Entry.BranchId != onlyBranch))
                {
                    continue;
                }

                bills.Add(ToDto(bill, group.Key, name, supplier?.CreditDays, query.AsOfUtc, query.WithinDays));
            }
        }

        return Summarize(bills, query.AsOfUtc, query.WithinDays, query.IncludeAll, suppliers.ToDictionary(s => s.Key, s => s.Value.CreditDays));
    }

    internal static PayableDueBillDto ToDto(
        SupplierBill bill, Guid supplierId, string supplierName, int? creditDays, DateTime asOfUtc, int withinDays)
    {
        DateTime? dueDateUtc = PaymentTerms.EffectiveDueDate(bill.Entry.DueDateUtc, bill.Entry.EntryDateUtc, creditDays);
        return new PayableDueBillDto(
            supplierId,
            supplierName,
            bill.Entry.Id,
            bill.Entry.EntryDateUtc,
            bill.ReferenceType,
            bill.ReferenceId,
            bill.Entry.DocumentNumber,
            bill.Entry.SupplierBillNumber,
            bill.Outstanding,
            dueDateUtc,
            dueDateUtc is { } due ? PaymentTerms.DaysOverdue(due, asOfUtc) : null,
            Math.Max(0, (asOfUtc - bill.Entry.EntryDateUtc).Days),
            PaymentTerms.ScheduleStatus(dueDateUtc, asOfUtc, withinDays),
            bill.Entry.BranchId);
    }

    /// <summary>Totals per supplier and overall; keeps only overdue / due-soon bills unless <paramref name="includeAll"/>.</summary>
    internal static PayablesDueDto Summarize(
        IReadOnlyList<PayableDueBillDto> bills, DateTime asOfUtc, int withinDays, bool includeAll,
        IReadOnlyDictionary<Guid, int?> creditDays)
    {
        static decimal Sum(IEnumerable<PayableDueBillDto> rows, string status) =>
            rows.Where(b => string.Equals(b.Status, status, StringComparison.Ordinal)).Sum(b => b.Outstanding);

        static bool Actionable(PayableDueBillDto b) =>
            string.Equals(b.Status, PaymentTerms.OverdueStatus, StringComparison.Ordinal)
            || string.Equals(b.Status, PaymentTerms.DueSoonStatus, StringComparison.Ordinal);

        var perSupplier = bills
            .GroupBy(b => b.SupplierId)
            .Select(g => new PayablesDueSupplierDto(
                g.Key,
                g.First().SupplierName,
                creditDays.GetValueOrDefault(g.Key),
                Sum(g, PaymentTerms.OverdueStatus),
                Sum(g, PaymentTerms.DueSoonStatus),
                Sum(g, PaymentTerms.LaterStatus),
                Sum(g, PaymentTerms.NoDueDateStatus),
                g.Sum(b => b.Outstanding),
                g.Count(b => string.Equals(b.Status, PaymentTerms.OverdueStatus, StringComparison.Ordinal)),
                g.Count(b => string.Equals(b.Status, PaymentTerms.DueSoonStatus, StringComparison.Ordinal)),
                g.Where(Actionable).Select(b => b.DueDateUtc).Min()))
            .Where(s => includeAll || s.Overdue > 0 || s.DueSoon > 0)
            .OrderByDescending(s => s.Overdue)
            .ThenByDescending(s => s.DueSoon)
            .ThenBy(s => s.SupplierName, StringComparer.OrdinalIgnoreCase)
            .ToList();

        var listed = bills
            .Where(b => includeAll || Actionable(b))
            .OrderBy(b => b.DueDateUtc ?? DateTime.MaxValue)
            .ThenBy(b => b.BillDateUtc)
            .ToList();

        return new PayablesDueDto(
            asOfUtc,
            withinDays,
            Sum(bills, PaymentTerms.OverdueStatus),
            Sum(bills, PaymentTerms.DueSoonStatus),
            Sum(bills, PaymentTerms.LaterStatus),
            Sum(bills, PaymentTerms.NoDueDateStatus),
            perSupplier,
            listed);
    }
}

using FSH.Framework.Persistence;
using FSH.Modules.Customers.Contracts.Dtos;
using FSH.Modules.Customers.Contracts.v1.Ledger;
using FSH.Modules.Customers.Data;
using FSH.Modules.Customers.Domain;
using FSH.Modules.Customers.Services;
using FSH.Modules.Multitenancy.Contracts;
using Mediator;
using Microsoft.EntityFrameworkCore;

namespace FSH.Modules.Customers.Features.v1.Ledger.GetReceivablesDue;

/// <summary>
/// Open customer debts by due date. Settlement is the AR aging's (<see cref="CustomerDebtSettlement"/>: FIFO over the
/// customer's whole account, then the branch filter), so the amounts agree with the aging report. A debt stored
/// without a due date is read with the customer's current credit days (<see cref="PaymentTerms"/>).
/// </summary>
public sealed class GetReceivablesDueQueryHandler(CustomersDbContext dbContext, ICurrentBranch currentBranch)
    : IQueryHandler<GetReceivablesDueQuery, ReceivablesDueDto>
{
    public async ValueTask<ReceivablesDueDto> Handle(GetReceivablesDueQuery query, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(query);

        Guid? branchFilter = await currentBranch.ResolveListBranchFilterAsync(query.BranchId, cancellationToken).ConfigureAwait(false);

        var entries = await CustomerDebtSettlement.LoadRowsAsync(dbContext, query.AsOfUtc, branchFilter, query.CustomerId, cancellationToken)
            .ConfigureAwait(false);
        if (entries.Count == 0)
        {
            return new ReceivablesDueDto(query.AsOfUtc, query.WithinDays, 0m, 0m, 0m, 0m, [], []);
        }

        // Trashed customers' balances are still receivable, so their names are resolved too.
        var customerIds = entries.Select(e => e.CustomerId).Distinct().ToList();
        var customers = await dbContext.Customers
            .AsNoTracking()
            .IgnoreQueryFilters([QueryFilters.SoftDelete])
            .Where(c => customerIds.Contains(c.Id))
            .Select(c => new { c.Id, c.Name, c.CreditDays })
            .ToDictionaryAsync(c => c.Id, cancellationToken)
            .ConfigureAwait(false);

        var invoices = new List<ReceivableDueInvoiceDto>();
        foreach (var group in entries.GroupBy(e => e.CustomerId))
        {
            var customer = customers.GetValueOrDefault(group.Key);
            foreach (var (row, remaining) in CustomerDebtSettlement.OpenDebits(group))
            {
                if (branchFilter is { } onlyBranch && row.BranchId != onlyBranch)
                {
                    continue;
                }

                invoices.Add(ToDto(row, remaining, customer?.Name ?? "(unknown)", customer?.CreditDays, query.AsOfUtc, query.WithinDays));
            }
        }

        return Summarize(invoices, query.AsOfUtc, query.WithinDays, query.IncludeAll,
            customers.ToDictionary(c => c.Key, c => c.Value.CreditDays));
    }

    internal static ReceivableDueInvoiceDto ToDto(
        CustomerArRow row, decimal remaining, string customerName, int? creditDays, DateTime asOfUtc, int withinDays)
    {
        DateTime? dueDateUtc = PaymentTerms.EffectiveDueDate(row.DueDateUtc, row.EntryDateUtc, creditDays);
        return new ReceivableDueInvoiceDto(
            row.CustomerId,
            customerName,
            row.Id,
            row.EntryDateUtc,
            row.EntryType.ToString(),
            row.DocumentNumber,
            row.ReferenceType,
            row.ReferenceId,
            remaining,
            dueDateUtc,
            dueDateUtc is { } due ? PaymentTerms.DaysOverdue(due, asOfUtc) : null,
            Math.Max(0, (asOfUtc - row.EntryDateUtc).Days),
            PaymentTerms.ScheduleStatus(dueDateUtc, asOfUtc, withinDays),
            row.BranchId);
    }

    /// <summary>Totals per customer and overall; keeps only overdue / due-soon debts unless <paramref name="includeAll"/>.</summary>
    internal static ReceivablesDueDto Summarize(
        IReadOnlyList<ReceivableDueInvoiceDto> invoices, DateTime asOfUtc, int withinDays, bool includeAll,
        IReadOnlyDictionary<Guid, int?> creditDays)
    {
        static decimal Sum(IEnumerable<ReceivableDueInvoiceDto> rows, string status) =>
            rows.Where(i => string.Equals(i.Status, status, StringComparison.Ordinal)).Sum(i => i.Outstanding);

        static bool Actionable(ReceivableDueInvoiceDto i) =>
            string.Equals(i.Status, PaymentTerms.OverdueStatus, StringComparison.Ordinal)
            || string.Equals(i.Status, PaymentTerms.DueSoonStatus, StringComparison.Ordinal);

        var perCustomer = invoices
            .GroupBy(i => i.CustomerId)
            .Select(g => new ReceivablesDueCustomerDto(
                g.Key,
                g.First().CustomerName,
                creditDays.GetValueOrDefault(g.Key),
                Sum(g, PaymentTerms.OverdueStatus),
                Sum(g, PaymentTerms.DueSoonStatus),
                Sum(g, PaymentTerms.LaterStatus),
                Sum(g, PaymentTerms.NoDueDateStatus),
                g.Sum(i => i.Outstanding),
                g.Count(i => string.Equals(i.Status, PaymentTerms.OverdueStatus, StringComparison.Ordinal)),
                g.Count(i => string.Equals(i.Status, PaymentTerms.DueSoonStatus, StringComparison.Ordinal)),
                g.Where(Actionable).Select(i => i.DueDateUtc).Min()))
            .Where(c => includeAll || c.Overdue > 0 || c.DueSoon > 0)
            .OrderByDescending(c => c.Overdue)
            .ThenByDescending(c => c.DueSoon)
            .ThenBy(c => c.CustomerName, StringComparer.OrdinalIgnoreCase)
            .ToList();

        var listed = invoices
            .Where(i => includeAll || Actionable(i))
            .OrderBy(i => i.DueDateUtc ?? DateTime.MaxValue)
            .ThenBy(i => i.EntryDateUtc)
            .ToList();

        return new ReceivablesDueDto(
            asOfUtc,
            withinDays,
            Sum(invoices, PaymentTerms.OverdueStatus),
            Sum(invoices, PaymentTerms.DueSoonStatus),
            Sum(invoices, PaymentTerms.LaterStatus),
            Sum(invoices, PaymentTerms.NoDueDateStatus),
            perCustomer,
            listed);
    }
}

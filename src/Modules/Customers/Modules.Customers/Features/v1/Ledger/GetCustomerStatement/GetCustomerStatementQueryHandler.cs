using FSH.Framework.Core.Exceptions;
using FSH.Framework.Persistence;
using FSH.Modules.Customers.Contracts.Dtos;
using FSH.Modules.Customers.Contracts.v1.Ledger;
using FSH.Modules.Customers.Data;
using FSH.Modules.Customers.Domain;
using FSH.Modules.Customers.Services;
using FSH.Modules.Multitenancy.Contracts;
using Mediator;
using Microsoft.EntityFrameworkCore;

namespace FSH.Modules.Customers.Features.v1.Ledger.GetCustomerStatement;

/// <summary>
/// A customer's AR statement over a period — the customer-side twin of <c>GetSupplierStatementQueryHandler</c>.
/// Every balance is computed in DATE order: the opening balance is the sum of every entry dated before the period,
/// and each line's running balance (and the closing balance) adds the period's entries in (entry date, created-at,
/// id) order; the stored <c>RunningBalance</c> (insertion order) is not used. Voided payments and their voids are
/// both listed (they net out) with the payment flagged <c>IsVoided</c>.
/// <para>Ageing as of the period end reuses the AR aging FIFO settlement (<see cref="CustomerDebtSettlement"/>):
/// settlement runs over the customer's entries at ALL branches (one account per customer) and, filtered to one
/// branch, only that branch's still-open debits are bucketed. Trashed customers still get a statement — their
/// balance is still receivable.</para>
/// </summary>
public sealed class GetCustomerStatementQueryHandler(CustomersDbContext dbContext, ICurrentBranch currentBranch)
    : IQueryHandler<GetCustomerStatementQuery, CustomerStatementDto>
{
    public async ValueTask<CustomerStatementDto> Handle(GetCustomerStatementQuery query, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(query);

        var customer = await dbContext.Customers
            .AsNoTracking()
            .IgnoreQueryFilters([QueryFilters.SoftDelete])
            .Where(c => c.Id == query.CustomerId)
            .Select(c => new { c.Id, c.Name, c.Code, c.Phone, c.PanNumber, c.CreditLimit, c.CreditDays })
            .FirstOrDefaultAsync(cancellationToken)
            .ConfigureAwait(false)
            ?? throw new NotFoundException($"Customer {query.CustomerId} not found.");

        Guid? branchFilter = await currentBranch.ResolveListBranchFilterAsync(query.BranchId, cancellationToken).ConfigureAwait(false);

        var openingBalanceQuery = dbContext.CustomerLedgerEntries
            .AsNoTracking()
            .Where(e => e.CustomerId == query.CustomerId && e.EntryDateUtc < query.FromUtc);

        var linesQuery = dbContext.CustomerLedgerEntries
            .AsNoTracking()
            .Where(e => e.CustomerId == query.CustomerId && e.EntryDateUtc >= query.FromUtc && e.EntryDateUtc <= query.ToUtc);

        if (branchFilter is { } branchId)
        {
            openingBalanceQuery = openingBalanceQuery.Where(e => e.BranchId == branchId);
            linesQuery = linesQuery.Where(e => e.BranchId == branchId);
        }

        decimal openingBalance = await openingBalanceQuery
            .SumAsync(e => e.DebitAmount - e.CreditAmount, cancellationToken)
            .ConfigureAwait(false);

        var rows = await linesQuery
            .OrderBy(e => e.EntryDateUtc)
            .ThenBy(e => e.CreatedAtUtc)
            .ThenBy(e => e.Id)
            .Select(e => new
            {
                e.Id,
                e.EntryDateUtc,
                e.EntryType,
                e.Description,
                e.DocumentNumber,
                e.DebitAmount,
                e.CreditAmount,
                e.ReferenceType,
                e.DueDateUtc,
                IsVoided = dbContext.CustomerLedgerEntries.Any(v =>
                    v.ReferenceType == CustomerLedgerEntry.PaymentVoidReference && v.ReferenceId == e.Id),
            })
            .ToListAsync(cancellationToken)
            .ConfigureAwait(false);

        decimal running = openingBalance;
        var lines = new List<CustomerStatementLineDto>(rows.Count);
        foreach (var r in rows)
        {
            running += r.DebitAmount - r.CreditAmount;
            // A payment void is a debit that reverses a payment, not money owed on terms: it has no due date.
            DateTime? dueDateUtc = r.DebitAmount > 0 && r.ReferenceType != CustomerLedgerEntry.PaymentVoidReference
                ? PaymentTerms.EffectiveDueDate(r.DueDateUtc, r.EntryDateUtc, customer.CreditDays)
                : null;
            lines.Add(new CustomerStatementLineDto(
                r.Id, r.EntryDateUtc, r.EntryType.ToString(), r.Description, r.DocumentNumber,
                r.DebitAmount, r.CreditAmount, running, r.IsVoided, dueDateUtc));
        }

        decimal totalDebits = lines.Sum(l => l.DebitAmount);
        decimal totalCredits = lines.Sum(l => l.CreditAmount);
        decimal closingBalance = lines.Count > 0 ? lines[^1].RunningBalance : openingBalance;

        var settlementRows = await CustomerDebtSettlement
            .LoadRowsAsync(dbContext, query.ToUtc, null, query.CustomerId, cancellationToken)
            .ConfigureAwait(false);
        var ageing = BuildAgeing(settlementRows, query.ToUtc, branchFilter, customer.CreditDays);

        return new CustomerStatementDto(
            customer.Id, customer.Name, customer.Code, customer.Phone, customer.PanNumber,
            customer.CreditLimit, customer.CreditDays,
            query.FromUtc, query.ToUtc,
            openingBalance, totalDebits, totalCredits, closingBalance,
            lines, ageing);
    }

    /// <summary>Buckets the open debits (FIFO) of one customer's <paramref name="rows"/> by age as of
    /// <paramref name="asOfUtc"/> — the same 30/60/90 rule as the AR aging report.</summary>
    private static CustomerStatementAgeingDto BuildAgeing(
        IReadOnlyList<CustomerArRow> rows, DateTime asOfUtc, Guid? branchFilter, int? creditDays)
    {
        ArgumentNullException.ThrowIfNull(rows);

        var openDebits = CustomerDebtSettlement.OpenDebits(rows);
        decimal openAll = openDebits.Sum(d => d.Remaining);
        decimal netAll = rows.Sum(r => r.DebitAmount - r.CreditAmount);
        // Settlement carries unused credit forward, so open debits minus net balance is the advance still on account.
        decimal unappliedAdvance = Math.Max(0m, openAll - netAll);

        decimal current = 0m, days31To60 = 0m, days61To90 = 0m, over90 = 0m, overdue = 0m;
        DateTime? earliestDue = null;
        foreach (var (row, remaining) in openDebits)
        {
            if (branchFilter is { } onlyBranch && row.BranchId != onlyBranch)
            {
                continue;
            }

            int ageDays = (asOfUtc - row.EntryDateUtc).Days;
            switch (ageDays)
            {
                case <= 30: current += remaining; break;
                case <= 60: days31To60 += remaining; break;
                case <= 90: days61To90 += remaining; break;
                default: over90 += remaining; break;
            }

            if (PaymentTerms.EffectiveDueDate(row.DueDateUtc, row.EntryDateUtc, creditDays) is { } due)
            {
                if (PaymentTerms.DaysOverdue(due, asOfUtc) > 0)
                {
                    overdue += remaining;
                }

                if (earliestDue is null || due < earliestDue)
                {
                    earliestDue = due;
                }
            }
        }

        decimal buckets = current + days31To60 + days61To90 + over90;
        return new CustomerStatementAgeingDto(
            current, days31To60, days61To90, over90, unappliedAdvance, buckets - unappliedAdvance, overdue, earliestDue);
    }
}

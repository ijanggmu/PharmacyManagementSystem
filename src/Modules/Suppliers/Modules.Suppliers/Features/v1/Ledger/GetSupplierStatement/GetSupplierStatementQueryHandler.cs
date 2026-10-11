using FSH.Modules.Suppliers.Contracts.Dtos;
using FSH.Modules.Suppliers.Contracts.v1.Ledger;
using FSH.Modules.Suppliers.Data;
using FSH.Modules.Multitenancy.Contracts;
using Mediator;
using Microsoft.EntityFrameworkCore;

namespace FSH.Modules.Suppliers.Features.v1.Ledger.GetSupplierStatement;

/// <summary>Ports <c>supplierStatementReport</c> (supplier-statement-service.ts). Every balance on the
/// statement is computed in DATE order: the opening balance is the sum of every entry dated before the
/// period, and each line's running balance (and the closing balance) adds the period's entries in
/// (entry date, created-at) order. The stored <c>RunningBalance</c> is NOT used: it reflects the order
/// entries were inserted, so a backdated entry (a receipt dated last week, posted today) would otherwise
/// show balances that don't add up down the page. Filtered to one branch, only that branch's entries count.</summary>
public sealed class GetSupplierStatementQueryHandler(SuppliersDbContext dbContext, ICurrentBranch currentBranch)
    : IQueryHandler<GetSupplierStatementQuery, SupplierStatementDto>
{
    public async ValueTask<SupplierStatementDto> Handle(GetSupplierStatementQuery query, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(query);

        Guid? branchFilter = await currentBranch.ResolveListBranchFilterAsync(query.BranchId, cancellationToken).ConfigureAwait(false);

        var openingBalanceQuery = dbContext.SupplierLedgerEntries
            .AsNoTracking()
            .Where(e => e.SupplierId == query.SupplierId && e.EntryDateUtc < query.FromUtc);

        var linesQuery = dbContext.SupplierLedgerEntries
            .AsNoTracking()
            .Where(e => e.SupplierId == query.SupplierId && e.EntryDateUtc >= query.FromUtc && e.EntryDateUtc <= query.ToUtc);

        if (branchFilter is { } branchId)
        {
            openingBalanceQuery = openingBalanceQuery.Where(e => e.BranchId == branchId);
            linesQuery = linesQuery.Where(e => e.BranchId == branchId);
        }

        decimal openingBalance = await openingBalanceQuery
            .SumAsync(e => e.DebitAmount - e.CreditAmount, cancellationToken)
            .ConfigureAwait(false);

        var lines = await linesQuery
            .OrderBy(e => e.EntryDateUtc)
            .ThenBy(e => e.CreatedAtUtc)
            .ThenBy(e => e.Id)
            .Select(e => new SupplierStatementLineDto(
                e.Id, e.EntryDateUtc, e.EntryType.ToString(), e.ReferenceType, e.ReferenceId,
                e.Description, e.DebitAmount, e.CreditAmount, e.RunningBalance, e.BranchId,
                e.DocumentNumber, e.SupplierBillNumber))
            .ToListAsync(cancellationToken)
            .ConfigureAwait(false);

        lines = WithRunningBalances(openingBalance, lines);
        decimal closingBalance = lines.Count > 0 ? lines[^1].RunningBalance : openingBalance;

        return new SupplierStatementDto(query.SupplierId, query.FromUtc, query.ToUtc, openingBalance, closingBalance, lines);
    }

    /// <summary>Re-stamps each line's running balance from the opening balance, in the order given.</summary>
    internal static List<SupplierStatementLineDto> WithRunningBalances(decimal openingBalance, IEnumerable<SupplierStatementLineDto> lines)
    {
        decimal running = openingBalance;
        return lines
            .Select(l =>
            {
                running += l.DebitAmount - l.CreditAmount;
                return l with { RunningBalance = running };
            })
            .ToList();
    }
}

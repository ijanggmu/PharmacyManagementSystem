using FSH.Modules.Suppliers.Contracts.Dtos;
using FSH.Modules.Suppliers.Contracts.v1.Ledger;
using FSH.Modules.Suppliers.Data;
using FSH.Modules.Multitenancy.Contracts;
using Mediator;
using Microsoft.EntityFrameworkCore;

namespace FSH.Modules.Suppliers.Features.v1.Ledger.GetSupplierStatement;

/// <summary>Ports <c>supplierStatementReport</c> (supplier-statement-service.ts): the opening
/// balance is the running balance carried by the last entry strictly before the period, and the
/// closing balance is the running balance of the last entry within the period (or the opening
/// balance, if nothing moved during the period). Filtered to one branch, RunningBalance (a tenant-wide
/// figure) no longer applies, so balances are recomputed from that branch's own entries.</summary>
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

        decimal openingBalance = branchFilter is null
            ? await openingBalanceQuery
                .OrderByDescending(e => e.EntryDateUtc)
                .ThenByDescending(e => e.CreatedAtUtc)
                .Select(e => e.RunningBalance)
                .FirstOrDefaultAsync(cancellationToken)
                .ConfigureAwait(false)
            : await openingBalanceQuery
                .SumAsync(e => e.DebitAmount - e.CreditAmount, cancellationToken)
                .ConfigureAwait(false);

        var lines = await linesQuery
            .OrderBy(e => e.EntryDateUtc)
            .ThenBy(e => e.CreatedAtUtc)
            .Select(e => new SupplierStatementLineDto(
                e.Id, e.EntryDateUtc, e.EntryType.ToString(), e.ReferenceType, e.ReferenceId,
                e.Description, e.DebitAmount, e.CreditAmount, e.RunningBalance, e.BranchId,
                e.DocumentNumber, e.SupplierBillNumber))
            .ToListAsync(cancellationToken)
            .ConfigureAwait(false);

        if (branchFilter is not null)
        {
            decimal running = openingBalance;
            lines = lines
                .Select(l =>
                {
                    running += l.DebitAmount - l.CreditAmount;
                    return l with { RunningBalance = running };
                })
                .ToList();
        }

        decimal closingBalance = lines.Count > 0 ? lines[^1].RunningBalance : openingBalance;

        return new SupplierStatementDto(query.SupplierId, query.FromUtc, query.ToUtc, openingBalance, closingBalance, lines);
    }
}

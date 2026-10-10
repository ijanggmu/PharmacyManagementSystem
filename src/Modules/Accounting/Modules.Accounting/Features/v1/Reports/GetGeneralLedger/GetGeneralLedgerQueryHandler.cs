using FSH.Framework.Core.Exceptions;
using FSH.Framework.Shared.Persistence;
using FSH.Modules.Accounting.Contracts.Dtos;
using FSH.Modules.Accounting.Contracts.v1.Reports;
using FSH.Modules.Accounting.Data;
using FSH.Modules.Accounting.Domain;
using FSH.Modules.Accounting.Services;
using FSH.Modules.Multitenancy.Contracts;
using Mediator;
using Microsoft.EntityFrameworkCore;

namespace FSH.Modules.Accounting.Features.v1.Reports.GetGeneralLedger;

/// <summary>
/// <see cref="GeneralLedgerReportDto.Lines"/> is paged (<see cref="GetGeneralLedgerQuery"/>
/// PageNumber/PageSize), but the running balance on each row and the report's opening/closing
/// balances must stay correct regardless of which page is viewed. This handler therefore:
/// 1) sums everything posted before <c>FromUtc</c> for <c>OpeningBalance</c> (unchanged by paging);
/// 2) aggregates the whole period's debit/credit in SQL for <c>ClosingBalance</c>, without
///    materialising every line;
/// 3) sums just the rows that come before the requested page (also via Skip/Take in SQL, not a full
///    table scan) to seed the running balance the page starts from;
/// 4) fetches only the requested page of detail rows and continues the running balance from there.
/// </summary>
public sealed class GetGeneralLedgerQueryHandler(AccountingDbContext dbContext, ICurrentBranch currentBranch)
    : IQueryHandler<GetGeneralLedgerQuery, GeneralLedgerReportDto>
{
    public async ValueTask<GeneralLedgerReportDto> Handle(GetGeneralLedgerQuery query, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(query);

        Guid? branchFilter = await currentBranch.ResolveListBranchFilterAsync(query.BranchId, cancellationToken).ConfigureAwait(false);

        int page = query.PageNumber < 1 ? 1 : query.PageNumber;
        int size = query.PageSize is < 1 or > 200 ? 50 : query.PageSize;

        var account = await dbContext.Accounts
            .AsNoTracking()
            .FirstOrDefaultAsync(a => a.Id == query.AccountId, cancellationToken)
            .ConfigureAwait(false)
            ?? throw new NotFoundException($"Account {query.AccountId} not found.");

        bool isDebitNormal = account.AccountType is AccountingAccountType.Asset or AccountingAccountType.Expense;

        var priorActivity = await (
            from line in dbContext.VoucherLines.AsNoTracking()
            join voucher in dbContext.LedgerVouchers() on line.VoucherId equals voucher.Id
            where line.AccountId == query.AccountId
                && voucher.VoucherDateUtc < query.FromUtc
                && (branchFilter == null || voucher.BranchId == branchFilter)
            select new { line.DebitAmount, line.CreditAmount })
            .ToListAsync(cancellationToken)
            .ConfigureAwait(false);

        decimal openingBalance = isDebitNormal
            ? priorActivity.Sum(l => l.DebitAmount) - priorActivity.Sum(l => l.CreditAmount)
            : priorActivity.Sum(l => l.CreditAmount) - priorActivity.Sum(l => l.DebitAmount);

        IQueryable<(Guid Id, string VoucherNo, DateTime VoucherDateUtc, string? Narration, decimal DebitAmount, decimal CreditAmount)> PeriodActivity() =>
            from line in dbContext.VoucherLines.AsNoTracking()
            join voucher in dbContext.LedgerVouchers() on line.VoucherId equals voucher.Id
            where line.AccountId == query.AccountId
                && voucher.VoucherDateUtc >= query.FromUtc
                && voucher.VoucherDateUtc <= query.ToUtc
                && (branchFilter == null || voucher.BranchId == branchFilter)
            orderby voucher.VoucherDateUtc, voucher.VoucherNo
            select new ValueTuple<Guid, string, DateTime, string?, decimal, decimal>(
                voucher.Id, voucher.VoucherNo, voucher.VoucherDateUtc, voucher.Narration, line.DebitAmount, line.CreditAmount);

        long totalCount = await PeriodActivity().LongCountAsync(cancellationToken).ConfigureAwait(false);

        // Net of every period row strictly before this page, in the same date/voucher-no order the page
        // uses — seeds the running balance the page's first row continues from. Only (page-1)*size rows
        // are pulled, via SQL LIMIT, never the full period.
        decimal runningBeforePage = openingBalance;
        if (page > 1)
        {
            var priorPageAmounts = await PeriodActivity()
                .Select(a => new { a.DebitAmount, a.CreditAmount })
                .Take((page - 1) * size)
                .ToListAsync(cancellationToken)
                .ConfigureAwait(false);

            foreach (var a in priorPageAmounts)
            {
                runningBeforePage += isDebitNormal ? a.DebitAmount - a.CreditAmount : a.CreditAmount - a.DebitAmount;
            }
        }

        var pageActivity = await PeriodActivity()
            .Skip((page - 1) * size)
            .Take(size)
            .ToListAsync(cancellationToken)
            .ConfigureAwait(false);

        decimal running = runningBeforePage;
        var lines = new List<GeneralLedgerLineDto>(pageActivity.Count);
        foreach (var a in pageActivity)
        {
            running += isDebitNormal ? a.DebitAmount - a.CreditAmount : a.CreditAmount - a.DebitAmount;
            lines.Add(new GeneralLedgerLineDto(a.Id, a.VoucherNo, a.VoucherDateUtc, a.Narration, a.DebitAmount, a.CreditAmount, running));
        }

        // Closing balance always covers the whole period — aggregated in SQL so it is correct
        // regardless of which page was requested, without loading every row into memory.
        // Queried directly off the entities (not PeriodActivity()'s ValueTuple projection) because EF
        // Core re-inlines the tuple constructor into the GroupBy/Sum lambda, which Npgsql can't translate.
        var periodTotals = await (
            from line in dbContext.VoucherLines.AsNoTracking()
            join voucher in dbContext.LedgerVouchers() on line.VoucherId equals voucher.Id
            where line.AccountId == query.AccountId
                && voucher.VoucherDateUtc >= query.FromUtc
                && voucher.VoucherDateUtc <= query.ToUtc
                && (branchFilter == null || voucher.BranchId == branchFilter)
            select new { line.DebitAmount, line.CreditAmount })
            .GroupBy(_ => 1)
            .Select(g => new { TotalDebit = g.Sum(x => x.DebitAmount), TotalCredit = g.Sum(x => x.CreditAmount) })
            .FirstOrDefaultAsync(cancellationToken)
            .ConfigureAwait(false);

        decimal closingBalance = openingBalance;
        if (periodTotals is not null)
        {
            closingBalance = isDebitNormal
                ? openingBalance + periodTotals.TotalDebit - periodTotals.TotalCredit
                : openingBalance + periodTotals.TotalCredit - periodTotals.TotalDebit;
        }

        var pagedLines = new PagedResponse<GeneralLedgerLineDto>
        {
            Items = lines,
            PageNumber = page,
            PageSize = size,
            TotalCount = totalCount,
            TotalPages = (int)Math.Ceiling(totalCount / (double)size),
        };

        return new GeneralLedgerReportDto(
            account.Id, account.Code, account.Name, account.AccountType.ToString(),
            query.FromUtc, query.ToUtc, openingBalance, pagedLines, closingBalance);
    }
}

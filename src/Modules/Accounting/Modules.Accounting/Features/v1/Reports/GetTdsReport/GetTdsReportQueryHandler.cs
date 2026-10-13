using FSH.Modules.Accounting.Contracts.Dtos;
using FSH.Modules.Accounting.Contracts.v1.Reports;
using FSH.Modules.Accounting.Data;
using FSH.Modules.Accounting.Domain;
using FSH.Modules.Accounting.Features.v1.Tds;
using FSH.Modules.Accounting.Services;
using FSH.Modules.Multitenancy.Contracts;
using Mediator;
using Microsoft.EntityFrameworkCore;

namespace FSH.Modules.Accounting.Features.v1.Reports.GetTdsReport;

/// <summary>
/// The TDS report: deductions (<see cref="TdsDeduction"/>) dated in the period whose voucher is still posted — a
/// voided supplier payment's reversed voucher drops its deduction — with totals per category and overall. Also the
/// TDS deposited with IRD in the period and the TDS Payable balance at its end (both tenant-wide, from the ledger).
/// </summary>
public sealed class GetTdsReportQueryHandler(AccountingDbContext dbContext, ICurrentBranch currentBranch)
    : IQueryHandler<GetTdsReportQuery, TdsReportDto>
{
    public async ValueTask<TdsReportDto> Handle(GetTdsReportQuery query, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(query);

        Guid? branchFilter = await currentBranch.ResolveListBranchFilterAsync(query.BranchId, cancellationToken).ConfigureAwait(false);

        var deductions = dbContext.TdsDeductions.AsNoTracking()
            .Where(d => d.DeductionDateUtc >= query.FromUtc && d.DeductionDateUtc <= query.ToUtc)
            .Where(d => dbContext.Vouchers.Any(v =>
                v.Status == AccountingVoucherStatus.Posted && v.ReferenceType == d.SourceType && v.ReferenceId == d.SourceId));
        if (branchFilter is { } branchId)
        {
            deductions = deductions.Where(d => d.BranchId == branchId);
        }

        var lines = await deductions
            .OrderBy(d => d.DeductionDateUtc)
            .ThenBy(d => d.CreatedAtUtc)
            .Select(d => new TdsReportLineDto(
                d.Id, d.DeductionDateUtc, d.SourceType, d.SourceId, d.VendorName, d.Pan, d.CategoryCode, d.CategoryName,
                d.RatePercent, d.TaxableAmount, d.TdsAmount, d.DocumentReference, d.BranchId))
            .ToListAsync(cancellationToken)
            .ConfigureAwait(false);

        var deposited = await TdsDepositedAsync(query, cancellationToken).ConfigureAwait(false);
        decimal balance = await TdsPayableAccount.BalanceAsOfAsync(dbContext, query.ToUtc.AddTicks(1), cancellationToken).ConfigureAwait(false);

        return Build(query.FromUtc, query.ToUtc, lines, deposited, balance);
    }

    /// <summary>Totals per category (in the order categories first appear) and overall. Pure, for tests.</summary>
    public static TdsReportDto Build(
        DateTime fromUtc, DateTime toUtc, IReadOnlyList<TdsReportLineDto> lines, decimal deposited, decimal payableBalance)
    {
        ArgumentNullException.ThrowIfNull(lines);

        var totals = lines
            .GroupBy(l => l.CategoryCode, StringComparer.Ordinal)
            .Select(g => new TdsReportCategoryTotalDto(
                g.Key, g.Last().CategoryName, g.Count(), g.Sum(l => l.TaxableAmount), g.Sum(l => l.TdsAmount)))
            .OrderBy(t => t.CategoryName, StringComparer.OrdinalIgnoreCase)
            .ToList();

        return new TdsReportDto(
            fromUtc, toUtc, lines, totals,
            lines.Sum(l => l.TaxableAmount), lines.Sum(l => l.TdsAmount),
            deposited, Math.Round(payableBalance, 2, MidpointRounding.AwayFromZero));
    }

    /// <summary>TDS deposits dated in the period that still stand: a reversed deposit is Void (its reversal is a
    /// journal), so only Posted deposit vouchers count. Each has one debit line, on TDS Payable.</summary>
    private async Task<decimal> TdsDepositedAsync(GetTdsReportQuery query, CancellationToken cancellationToken) =>
        await (
            from line in dbContext.VoucherLines.AsNoTracking()
            join voucher in dbContext.Vouchers.AsNoTracking() on line.VoucherId equals voucher.Id
            where voucher.Status == AccountingVoucherStatus.Posted
                && voucher.VoucherType == TdsVouchers.PaymentVoucherType
                && voucher.VoucherDateUtc >= query.FromUtc
                && voucher.VoucherDateUtc <= query.ToUtc
            select line.DebitAmount)
            .SumAsync(cancellationToken)
            .ConfigureAwait(false);
}

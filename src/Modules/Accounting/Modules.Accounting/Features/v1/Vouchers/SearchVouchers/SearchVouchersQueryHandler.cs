using FSH.Framework.Shared.Persistence;
using FSH.Modules.Accounting.Contracts.Dtos;
using FSH.Modules.Accounting.Contracts.v1.Vouchers;
using FSH.Modules.Accounting.Data;
using FSH.Modules.Accounting.Domain;
using FSH.Modules.Multitenancy.Contracts;
using Mediator;
using Microsoft.EntityFrameworkCore;

namespace FSH.Modules.Accounting.Features.v1.Vouchers.SearchVouchers;

public sealed class SearchVouchersQueryHandler(AccountingDbContext dbContext, ICurrentBranch currentBranch)
    : IQueryHandler<SearchVouchersQuery, PagedResponse<AccountingVoucherDto>>
{
    private const string ManualJournalType = "journal";

    public async ValueTask<PagedResponse<AccountingVoucherDto>> Handle(SearchVouchersQuery query, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(query);

        Guid? branchFilter = await currentBranch.ResolveListBranchFilterAsync(query.BranchId, cancellationToken).ConfigureAwait(false);

        int page = query.PageNumber < 1 ? 1 : query.PageNumber;
        int size = query.PageSize is < 1 or > 200 ? 50 : query.PageSize;

        var vouchers = dbContext.Vouchers.AsNoTracking();
        var q = ApplyStatus(vouchers, vouchers, query.Status);

        if (!string.IsNullOrWhiteSpace(query.VoucherType))
        {
            string type = query.VoucherType.Trim();
            // A reversal is always a "journal"; it also matches the type of the voucher it reverses so a
            // "Sales" filter lists a sale together with its reversal.
            q = q.Where(v => v.VoucherType == type
                || (v.ReversesVoucherId != null && vouchers.Any(o => o.Id == v.ReversesVoucherId && o.VoucherType == type)));
        }

        if (string.Equals(query.Source?.Trim(), VoucherSourceFilters.Manual, StringComparison.OrdinalIgnoreCase))
        {
            q = q.Where(v => v.Source == AccountingVoucherSource.Manual && v.VoucherType == ManualJournalType);
        }
        else if (string.Equals(query.Source?.Trim(), VoucherSourceFilters.System, StringComparison.OrdinalIgnoreCase))
        {
            q = q.Where(v => v.Source != AccountingVoucherSource.Manual || v.VoucherType != ManualJournalType);
        }

        if (query.DateFromUtc is { } from)
        {
            q = q.Where(v => v.VoucherDateUtc >= from);
        }

        if (query.DateToUtc is { } to)
        {
            q = q.Where(v => v.VoucherDateUtc <= to);
        }

        if (branchFilter is { } branchId)
        {
            q = q.Where(v => v.BranchId == branchId);
        }

        if (!string.IsNullOrWhiteSpace(query.Search))
        {
            // ToUpper().Contains translates to upper(..) LIKE on Npgsql and also runs on the InMemory provider.
            string term = query.Search.Trim().ToUpperInvariant();
#pragma warning disable CA1304, CA1311, CA1862 // Culture-insensitive upper-casing is intended inside an EF query.
            q = q.Where(v =>
                v.VoucherNo.ToUpper().Contains(term) ||
                (v.Narration != null && v.Narration.ToUpper().Contains(term)) ||
                (v.ReferenceType != null && v.ReferenceType.ToUpper().Contains(term)));
#pragma warning restore CA1304, CA1311, CA1862
        }

        // Id breaks ties so a page boundary never repeats or skips a voucher.
        q = q.OrderByDescending(v => v.VoucherDateUtc).ThenByDescending(v => v.CreatedAtUtc).ThenByDescending(v => v.Id);

        long total = await q.LongCountAsync(cancellationToken).ConfigureAwait(false);
        // Lines are not loaded for the list, but the register needs each voucher's totals and its
        // reversal links: aggregate them in the same query.
        var rows = await q
            .Skip((page - 1) * size)
            .Take(size)
            .Select(v => new
            {
                Voucher = v,
                TotalDebit = v.Lines.Sum(l => l.DebitAmount),
                TotalCredit = v.Lines.Sum(l => l.CreditAmount),
                LineCount = v.Lines.Count,
                ReversesVoucherNo = vouchers.Where(o => o.Id == v.ReversesVoucherId).Select(o => o.VoucherNo).FirstOrDefault(),
                ReversedById = vouchers
                    .Where(r => r.ReversesVoucherId == v.Id)
                    .OrderBy(r => r.Status == AccountingVoucherStatus.Posted ? 0 : 1)
                    .ThenByDescending(r => r.CreatedAtUtc)
                    .Select(r => (Guid?)r.Id)
                    .FirstOrDefault(),
                ReversedByNo = vouchers
                    .Where(r => r.ReversesVoucherId == v.Id)
                    .OrderBy(r => r.Status == AccountingVoucherStatus.Posted ? 0 : 1)
                    .ThenByDescending(r => r.CreatedAtUtc)
                    .Select(r => r.VoucherNo)
                    .FirstOrDefault(),
            })
            .ToListAsync(cancellationToken)
            .ConfigureAwait(false);

        return new PagedResponse<AccountingVoucherDto>
        {
            Items = rows
                .Select(r => new AccountingVoucherDto(
                    r.Voucher.Id, r.Voucher.VoucherNo, r.Voucher.VoucherDateUtc, r.Voucher.VoucherType, r.Voucher.Source.ToString(),
                    r.Voucher.ReferenceType, r.Voucher.ReferenceId, r.Voucher.Status.ToString(), r.Voucher.Narration,
                    r.Voucher.CreatedAtUtc, r.Voucher.PostedAtUtc, r.Voucher.PostedBy, r.Voucher.VoidReason,
                    Array.Empty<AccountingVoucherLineDto>(), r.Voucher.BranchId,
                    r.TotalDebit, r.TotalCredit, r.LineCount,
                    r.Voucher.ReversesVoucherId, r.ReversesVoucherNo,
                    r.ReversedById, r.ReversedByNo))
                .ToList(),
            PageNumber = page,
            PageSize = size,
            TotalCount = total,
            TotalPages = (int)Math.Ceiling(total / (double)size)
        };
    }

    /// <summary>Applies a <see cref="VoucherStatusFilters"/> value. Unknown values are rejected by the validator.</summary>
    internal static IQueryable<AccountingVoucher> ApplyStatus(
        IQueryable<AccountingVoucher> q, IQueryable<AccountingVoucher> allVouchers, string? status)
    {
        if (string.IsNullOrWhiteSpace(status))
        {
            return q;
        }

        string? key = VoucherStatusFilters.All.FirstOrDefault(f => string.Equals(f, status.Trim(), StringComparison.OrdinalIgnoreCase));
        return key switch
        {
            VoucherStatusFilters.Draft => q.Where(v => v.Status == AccountingVoucherStatus.Draft),
            VoucherStatusFilters.Posted => q.Where(v => v.Status == AccountingVoucherStatus.Posted),
            VoucherStatusFilters.Void => q.Where(v => v.Status == AccountingVoucherStatus.Void),
            VoucherStatusFilters.Reversed => q.Where(v => v.Status == AccountingVoucherStatus.Void
                && allVouchers.Any(r => r.ReversesVoucherId == v.Id)),
            VoucherStatusFilters.Voided => q.Where(v => v.Status == AccountingVoucherStatus.Void
                && !allVouchers.Any(r => r.ReversesVoucherId == v.Id)),
            VoucherStatusFilters.Reversal => q.Where(v => v.ReversesVoucherId != null),
            _ => q,
        };
    }
}

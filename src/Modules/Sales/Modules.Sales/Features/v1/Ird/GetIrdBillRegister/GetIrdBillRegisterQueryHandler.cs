using FluentValidation;
using FSH.Modules.Customers.Contracts.Dtos;
using FSH.Modules.Customers.Contracts.v1.Customers;
using FSH.Modules.Identity.Contracts.Services;
using FSH.Modules.Multitenancy.Contracts;
using FSH.Modules.Sales.Contracts.Dtos;
using FSH.Modules.Sales.Contracts.Fiscal;
using FSH.Modules.Sales.Contracts.v1.Ird;
using FSH.Modules.Sales.Data;
using FSH.Modules.Sales.Domain;
using FSH.Modules.Sales.Features.v1.Ird.GetIrdSalesRegister;
using FSH.Modules.Sales.Services;
using Mediator;
using Microsoft.EntityFrameworkCore;

namespace FSH.Modules.Sales.Features.v1.Ird.GetIrdBillRegister;

/// <summary>
/// IRD's materialized view of sales bills. One row per issued invoice (cancelled ones included, inactive), with the
/// print log (<see cref="SalePrint"/>: printed?, first print time and user, count), the IRD sync state and whether
/// the accepted submission was realtime (from the bill's queue row), the buyer (recorded buyer name/PAN, else the
/// customer), the cashier who entered it, payment method and references, and the VAT given back on credit notes.
/// Cross-module reads go through Contracts only: customer names (Customers) and user names (Identity's
/// <see cref="IUserService"/>, one list per report, as Chat's mention resolver does).
/// </summary>
public sealed class GetIrdBillRegisterQueryHandler(
    SalesDbContext dbContext,
    IMediator mediator,
    IUserService users,
    ICurrentBranch currentBranch) : IQueryHandler<GetIrdBillRegisterQuery, IReadOnlyList<IrdBillRegisterRowDto>>
{
    public async ValueTask<IReadOnlyList<IrdBillRegisterRowDto>> Handle(GetIrdBillRegisterQuery query, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(query);

        var (from, to) = ResolvePeriod(query);
        Guid? branchId = await currentBranch.ResolveListBranchFilterAsync(query.BranchId, cancellationToken).ConfigureAwait(false);

        var sales = await dbContext.Sales.AsNoTracking()
            .Include(s => s.Items)
            .Include(s => s.Payments)
            .Where(s => (s.Status == SaleStatus.Completed || s.Status == SaleStatus.Cancelled)
                && s.InvoiceNumber != null
                && s.SaleDateUtc >= from
                && s.SaleDateUtc <= to
                && (!branchId.HasValue || s.BranchId == branchId.Value))
            .OrderBy(s => s.SaleDateUtc)
            .ToListAsync(cancellationToken)
            .ConfigureAwait(false);
        if (sales.Count == 0)
        {
            return [];
        }

        var saleIds = sales.Select(s => s.Id).ToList();

        var prints = (await dbContext.SalePrints.AsNoTracking()
                .Where(p => saleIds.Contains(p.SaleId))
                .Select(p => new { p.SaleId, p.PrintNumber, p.PrintedAtUtc, p.PrintedByUserId })
                .ToListAsync(cancellationToken)
                .ConfigureAwait(false))
            .GroupBy(p => p.SaleId)
            .ToDictionary(g => g.Key, g => (Count: g.Count(), First: g.OrderBy(p => p.PrintedAtUtc).First()));

        var realtime = (await dbContext.IrdInvoiceQueues.AsNoTracking()
                .Where(q => saleIds.Contains(q.SaleId) && q.DocumentType == IrdDocumentType.Bill && q.Status == IrdQueueStatus.Sent)
                .Select(q => new { q.SaleId, q.IsRealtime, q.SentAtUtc })
                .ToListAsync(cancellationToken)
                .ConfigureAwait(false))
            .GroupBy(q => q.SaleId)
            .ToDictionary(g => g.Key, g => g.OrderBy(q => q.SentAtUtc).First().IsRealtime);

        var returnVat = await dbContext.SaleReturns.AsNoTracking()
            .Where(r => saleIds.Contains(r.SaleId) && r.StockRestoredAtUtc != null)
            .GroupBy(r => r.SaleId)
            .Select(g => new { SaleId = g.Key, Vat = g.Sum(r => r.VatAmount ?? 0m) })
            .ToDictionaryAsync(x => x.SaleId, x => x.Vat, cancellationToken)
            .ConfigureAwait(false);
        var refundVat = await dbContext.SaleRefunds.AsNoTracking()
            .Where(r => saleIds.Contains(r.OriginalSaleId) && r.AccountingPostedAtUtc != null)
            .GroupBy(r => r.OriginalSaleId)
            .Select(g => new { SaleId = g.Key, Vat = g.Sum(r => r.VatAmount ?? 0m) })
            .ToDictionaryAsync(x => x.SaleId, x => x.Vat, cancellationToken)
            .ConfigureAwait(false);

        decimal threshold = await dbContext.IrdSettings.AsNoTracking()
            .Select(s => (decimal?)s.AbbreviatedInvoiceThreshold)
            .FirstOrDefaultAsync(cancellationToken)
            .ConfigureAwait(false) ?? IrdSettings.DefaultAbbreviatedInvoiceThreshold;

        var customers = await LoadCustomersAsync(
            sales.Where(s => s.CustomerId.HasValue).Select(s => s.CustomerId!.Value).Distinct().ToList(), cancellationToken).ConfigureAwait(false);
        var userNames = await LoadUserNamesAsync(cancellationToken).ConfigureAwait(false);

        string? UserName(Guid? userId) =>
            userId is { } id ? userNames.GetValueOrDefault(id.ToString()) ?? id.ToString() : null;

        var rows = new List<IrdBillRegisterRowDto>(sales.Count);
        foreach (var s in sales)
        {
            decimal total = Money.Round(s.TotalAmount);
            decimal discount = Money.Round(s.Items.Sum(i => i.DiscountAmount));
            var (taxable, exempt) = GetIrdSalesRegisterQueryHandler.VatBreakdown(total, s.VatAmount, s.TaxableAmount, s.ExemptAmount, s.VatRatePercent);
            bool active = s.Status == SaleStatus.Completed;
            decimal vatRefund = returnVat.GetValueOrDefault(s.Id) + refundVat.GetValueOrDefault(s.Id) + (active ? 0m : s.VatAmount ?? 0m);
            var print = prints.TryGetValue(s.Id, out var p) ? p : default;
            string customerName = s.BuyerName
                ?? (s.CustomerId is { } cid ? customers.GetValueOrDefault(cid)?.Name : null)
                ?? string.Empty;
            string? references = string.Join(", ", s.Payments.Select(x => x.Reference).Where(r => !string.IsNullOrWhiteSpace(r)));

            rows.Add(new IrdBillRegisterRowDto(
                SaleId: s.Id,
                FiscalYear: NepalFiscalYear.Label(s.FiscalYear ?? NepalFiscalYear.StartYearFor(s.SaleDateUtc)),
                BillNo: s.InvoiceNumber!,
                CustomerName: customerName,
                CustomerPan: s.BuyerPan,
                BillDate: BikramSambat.FormatUtc(s.SaleDateUtc),
                BillDateUtc: s.SaleDateUtc,
                Amount: total + discount,
                Discount: discount,
                TaxableAmount: Money.Round(taxable ?? 0m),
                TaxAmount: Money.Round(s.VatAmount ?? 0m),
                ExemptAmount: Money.Round(exempt ?? (s.VatAmount is null ? total : 0m)),
                TotalAmount: total,
                SyncWithIrd: s.IrdStatus == IrdSyncStatus.Synced,
                IsBillPrinted: print.Count > 0,
                IsBillActive: active,
                PrintedTimeUtc: print.Count > 0 ? print.First.PrintedAtUtc : null,
                EnteredBy: UserName(s.CashierUserId),
                PrintedBy: print.Count > 0 ? UserName(print.First.PrintedByUserId) : null,
                IsRealtime: realtime.GetValueOrDefault(s.Id),
                PaymentMethod: s.PaymentMethod,
                VatRefundAmount: Money.Round(vatRefund),
                TransactionId: references.Length == 0 ? null : references,
                PrintCount: print.Count,
                IrdStatus: s.IrdStatus.ToString(),
                InvoiceType: IrdInvoiceTypes.For(total, s.BuyerPan, threshold)));
        }

        return rows;
    }

    /// <summary>The UTC bounds, inclusive. A fiscal year (BS start year) narrows the range to its Nepal days.</summary>
    public static (DateTime From, DateTime To) ResolvePeriod(GetIrdBillRegisterQuery query)
    {
        ArgumentNullException.ThrowIfNull(query);
        DateTime from = query.FromUtc ?? DateTime.MinValue;
        DateTime to = query.ToUtc ?? DateTime.MaxValue;
        if (query.FiscalYear is { } fy)
        {
            var (start, end) = NepalFiscalYear.Range(fy);
            DateTime fyFrom = NepalDayRange.StartUtc(start);
            DateTime fyTo = NepalDayRange.EndExclusiveUtc(end).AddTicks(-1);
            from = fyFrom > from ? fyFrom : from;
            to = fyTo < to ? fyTo : to;
        }

        return (from, to);
    }

    private async Task<Dictionary<Guid, CustomerLookupDto>> LoadCustomersAsync(IReadOnlyList<Guid> customerIds, CancellationToken ct)
    {
        var result = new Dictionary<Guid, CustomerLookupDto>();
        foreach (var chunk in customerIds.Chunk(LookupCustomersQuery.MaxIds))
        {
            var rows = await mediator.Send(new LookupCustomersQuery(chunk, null, chunk.Length), ct).ConfigureAwait(false);
            foreach (var row in rows)
            {
                result[row.Id] = row;
            }
        }

        return result;
    }

    private async Task<Dictionary<string, string>> LoadUserNamesAsync(CancellationToken ct)
    {
        var list = await users.GetListAsync(ct).ConfigureAwait(false);
        return list
            .Where(u => !string.IsNullOrWhiteSpace(u.Id))
            .GroupBy(u => u.Id!, StringComparer.OrdinalIgnoreCase)
            .ToDictionary(
                g => g.Key,
                g =>
                {
                    var u = g.First();
                    string full = $"{u.FirstName} {u.LastName}".Trim();
                    return full.Length > 0 ? full : u.UserName ?? u.Email ?? g.Key;
                },
                StringComparer.OrdinalIgnoreCase);
    }
}

public sealed class GetIrdBillRegisterQueryValidator : AbstractValidator<GetIrdBillRegisterQuery>
{
    public GetIrdBillRegisterQueryValidator()
    {
        RuleFor(q => q)
            .Must(q => q.FiscalYear.HasValue || (q.FromUtc.HasValue && q.ToUtc.HasValue))
            .WithMessage("Give a fiscal year, or both fromUtc and toUtc.");
        RuleFor(q => q)
            .Must(q => !q.FromUtc.HasValue || !q.ToUtc.HasValue || q.FromUtc <= q.ToUtc)
            .WithMessage("fromUtc must be on or before toUtc.");
        RuleFor(q => q.FiscalYear)
            .InclusiveBetween(NepalFiscalYear.FirstStartYear, NepalFiscalYear.LastStartYear)
            .When(q => q.FiscalYear.HasValue)
            .WithMessage($"Fiscal year must be a BS start year between {NepalFiscalYear.FirstStartYear} and {NepalFiscalYear.LastStartYear}.");
    }
}

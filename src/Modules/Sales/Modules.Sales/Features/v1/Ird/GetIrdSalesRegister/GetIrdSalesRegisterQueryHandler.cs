using FSH.Framework.Core.Exceptions;
using FSH.Modules.Customers.Contracts.Dtos;
using FSH.Modules.Customers.Contracts.v1.Customers;
using FSH.Modules.Multitenancy.Contracts;
using FSH.Modules.Sales.Contracts.Dtos;
using FSH.Modules.Sales.Contracts.v1.Ird;
using FSH.Modules.Sales.Data;
using FSH.Modules.Sales.Domain;
using Mediator;
using Microsoft.EntityFrameworkCore;

namespace FSH.Modules.Sales.Features.v1.Ird.GetIrdSalesRegister;

/// <summary>
/// .NET port of the <c>sales-register</c>/<c>annex-13</c> report types from the Next.js reference's
/// <c>getIrdReportRows</c> (lib/server/services/reports-service.ts). Composes across modules through a
/// Contracts-only Mediator query (architecture.md), same batched-lookup pattern as
/// <c>GetNarcoticRegisterQueryHandler</c>. Branch-scoped like other Sales report queries
/// (<c>GetMedicineSalesVelocityQueryHandler</c>) via <see cref="ICurrentBranch.GetListFilterBranchIdAsync"/>.
/// </summary>
public sealed class GetIrdSalesRegisterQueryHandler(SalesDbContext dbContext, IMediator mediator, ICurrentBranch currentBranch)
    : IQueryHandler<GetIrdSalesRegisterQuery, IReadOnlyList<IrdSalesRegisterRowDto>>
{
    public async ValueTask<IReadOnlyList<IrdSalesRegisterRowDto>> Handle(
        GetIrdSalesRegisterQuery query, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(query);

        Guid? branchId = await currentBranch.ResolveListBranchFilterAsync(query.BranchId, cancellationToken).ConfigureAwait(false);

        var sales = await dbContext.Sales.AsNoTracking()
            .Include(s => s.Items)
            .Where(s => s.Status == SaleStatus.Completed
                && s.SaleDateUtc >= query.PeriodStartUtc
                && s.SaleDateUtc <= query.PeriodEndUtc
                && (!branchId.HasValue || s.BranchId == branchId.Value))
            .OrderBy(s => s.SaleDateUtc)
            .ToListAsync(cancellationToken)
            .ConfigureAwait(false);

        if (sales.Count == 0)
        {
            return [];
        }

        var customerIds = sales
            .Where(s => s.CustomerId.HasValue)
            .Select(s => s.CustomerId!.Value)
            .Distinct()
            .ToList();

        var customers = await LoadCustomersAsync(customerIds, cancellationToken).ConfigureAwait(false);

        return sales
            .Select(s =>
            {
                var customer = s.CustomerId.HasValue ? customers.GetValueOrDefault(s.CustomerId.Value) : null;
                decimal discountAmount = s.Items.Sum(i => i.DiscountAmount);
                var (taxable, exempt) = VatBreakdown(s.TotalAmount, s.VatAmount, s.TaxableAmount, s.ExemptAmount, s.VatRatePercent);
                return new IrdSalesRegisterRowDto(
                    s.Id,
                    s.InvoiceNumber,
                    s.SaleDateUtc,
                    s.TotalAmount,
                    s.VatAmount,
                    discountAmount,
                    s.PaymentMethod,
                    s.IrdStatus.ToString(),
                    s.CustomerId,
                    customer?.Name ?? (s.CustomerId.HasValue ? "—" : "Walk-in"),
                    customer?.Phone,
                    customer?.Email,
                    taxable,
                    exempt);
            })
            .ToList();
    }

    /// <summary>Nepal's standard VAT rate, used to back out the taxable value of sales recorded before the
    /// rate was stored on the sale.</summary>
    public const decimal DefaultVatRatePercent = 13m;

    /// <summary>
    /// The taxable (VAT-exclusive) and exempt values of a sale. Uses the breakdown stored at sale time when
    /// present; for older sales derives taxable = VAT ÷ rate and exempt = total − taxable − VAT (the
    /// remainder). Total − VAT is NOT the taxable value — it also contains the exempt lines.
    /// </summary>
    public static (decimal? Taxable, decimal? Exempt) VatBreakdown(
        decimal totalAmount, decimal? vatAmount, decimal? storedTaxable, decimal? storedExempt, decimal? vatRatePercent)
    {
        if (storedTaxable is { } taxable && storedExempt is { } exempt)
        {
            return (taxable, exempt);
        }

        if (vatAmount is not { } vat)
        {
            return (null, null);
        }

        decimal rate = vatRatePercent is > 0m ? vatRatePercent.Value : DefaultVatRatePercent;
        decimal derivedTaxable = vat == 0m ? 0m : Math.Round(vat * 100m / rate, 2, MidpointRounding.AwayFromZero);
        decimal derivedExempt = Math.Max(0m, totalAmount - derivedTaxable - vat);
        return (derivedTaxable, derivedExempt);
    }

    private async Task<Dictionary<Guid, CustomerDto>> LoadCustomersAsync(IReadOnlyList<Guid> customerIds, CancellationToken ct)
    {
        var result = new Dictionary<Guid, CustomerDto>();
        foreach (var id in customerIds)
        {
            try
            {
                var customer = await mediator.Send(new GetCustomerByIdQuery(id), ct).ConfigureAwait(false);
                result[id] = customer;
            }
            catch (NotFoundException)
            {
                // Customer since deleted/purged — leave unresolved rather than fail the whole report.
            }
        }

        return result;
    }
}

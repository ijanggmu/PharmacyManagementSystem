using FSH.Modules.Multitenancy.Contracts;
using FSH.Modules.Sales.Contracts.Dtos;
using FSH.Modules.Sales.Contracts.v1.Reports;
using FSH.Modules.Sales.Data;
using FSH.Modules.Sales.Domain;
using Mediator;
using Microsoft.EntityFrameworkCore;

namespace FSH.Modules.Sales.Features.v1.Reports.GetMedicineMargins;

/// <summary>Top medicines by gross margin on completed sales, branch scoped — see <see cref="GetMedicineMarginsQuery"/>.</summary>
public sealed class GetMedicineMarginsQueryHandler(SalesDbContext dbContext, ICurrentBranch currentBranch)
    : IQueryHandler<GetMedicineMarginsQuery, IReadOnlyList<MedicineMarginDto>>
{
    public async ValueTask<IReadOnlyList<MedicineMarginDto>> Handle(GetMedicineMarginsQuery query, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(query);

        Guid? branchId = await currentBranch.ResolveListBranchFilterAsync(query.BranchId, cancellationToken).ConfigureAwait(false);

        // A flat projection of only the columns the arithmetic needs (nothing tracked); grouping happens in
        // memory because the VAT carve-out depends on the owning sale.
        var lines = await (
            from s in dbContext.Sales.AsNoTracking()
            where s.Status == SaleStatus.Completed
                && s.SaleDateUtc >= query.FromUtc
                && s.SaleDateUtc <= query.ToUtc
                && (branchId == null || s.BranchId == branchId)
            from i in s.Items
            select new MedicineMarginLine(
                i.MedicineId,
                i.Quantity,
                (i.Quantity * i.UnitPrice) - i.DiscountAmount,
                i.UnitCostPrice,
                i.IsTaxable,
                s.VatAmount,
                s.VatRatePercent))
            .ToListAsync(cancellationToken)
            .ConfigureAwait(false);

        return MedicineMarginCalculator.Top(lines, query.Take);
    }
}

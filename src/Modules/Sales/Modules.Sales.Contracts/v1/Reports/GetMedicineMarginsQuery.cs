using FSH.Modules.Sales.Contracts.Dtos;
using Mediator;

namespace FSH.Modules.Sales.Contracts.v1.Reports;

/// <summary>
/// The <paramref name="Take"/> medicines with the highest gross margin on completed sales in [FromUtc, ToUtc]:
/// net revenue (line total less the VAT carved out of taxable lines) minus the batch cost recorded on each
/// line (<c>SaleItem.UnitCostPrice</c>, the same cost the COGS voucher is posted at). Returns and refunds are
/// not netted off — it is a ranking of what sells profitably, not a P&amp;L. Branch scoped like every report
/// (see ICurrentBranch). Internal cross-module query (Accounting's owner dashboard) — no HTTP endpoint.
/// </summary>
public sealed record GetMedicineMarginsQuery(DateTime FromUtc, DateTime ToUtc, int Take = 5, Guid? BranchId = null)
    : IQuery<IReadOnlyList<MedicineMarginDto>>;

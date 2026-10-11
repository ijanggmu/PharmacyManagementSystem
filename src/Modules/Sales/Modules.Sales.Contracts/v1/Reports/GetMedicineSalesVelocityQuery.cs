using Mediator;

namespace FSH.Modules.Sales.Contracts.v1.Reports;

/// <summary>
/// Units sold per requested medicine over the last <paramref name="WindowDays"/> days, counting
/// completed sales in the CURRENT branch only (see <c>ICurrentBranch</c>). Medicines with no sales in
/// the window are absent from the result — callers should treat a missing key as zero units sold.
/// Internal cross-module query — no HTTP endpoint of its own; used by Purchasing's reorder
/// suggestions so it never touches <c>SalesDbContext</c> directly.
/// </summary>
public sealed record GetMedicineSalesVelocityQuery(IReadOnlyList<Guid> MedicineIds, int WindowDays = 30)
    : IQuery<IReadOnlyDictionary<Guid, decimal>>;

using Mediator;

namespace FSH.Modules.Sales.Contracts.v1.Reports;

/// <summary>
/// For each requested medicine, the most recent <c>SaleDateUtc</c> of a completed sale that dispensed
/// it (medicines with no completed sale are simply absent from the result — callers should treat a
/// missing key as "never sold"). Internal cross-module query — no HTTP endpoint of its own, same
/// convention as Inventory's <c>GetStockValuationQuery</c>. Used by Inventory's dead-stock report so
/// it never touches <c>SalesDbContext</c> directly.
/// </summary>
public sealed record GetLastSaleDatesForMedicinesQuery(IReadOnlyList<Guid> MedicineIds, Guid? BranchId = null)
    : IQuery<IReadOnlyDictionary<Guid, DateTime>>;

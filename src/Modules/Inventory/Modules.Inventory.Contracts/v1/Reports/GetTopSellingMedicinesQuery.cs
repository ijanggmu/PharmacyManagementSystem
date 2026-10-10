using FSH.Modules.Inventory.Contracts.Dtos;
using Mediator;

namespace FSH.Modules.Inventory.Contracts.v1.Reports;

/// <summary>Top medicines by quantity sold (ties broken by revenue) over [FromUtc, ToUtc], current-branch
/// scoped, computed over the whole period server-side (not a page of sales).</summary>
public sealed record GetTopSellingMedicinesQuery(DateTime FromUtc, DateTime ToUtc, int Take = 10, Guid? BranchId = null)
    : IQuery<IReadOnlyList<TopSellingMedicineDto>>;

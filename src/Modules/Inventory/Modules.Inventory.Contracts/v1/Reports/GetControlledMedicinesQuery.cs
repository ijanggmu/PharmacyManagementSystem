using FSH.Modules.Inventory.Contracts.Dtos;
using Mediator;

namespace FSH.Modules.Inventory.Contracts.v1.Reports;

/// <summary>
/// All non-deleted medicines flagged <c>IsControlled</c> (scheduled/narcotic). Internal cross-module
/// query — no HTTP endpoint of its own, same convention as <see cref="GetStockValuationQuery"/>.
/// Used by Sales' narcotic/DDA register report to identify which dispensed line items are
/// controlled-substance dispensing events without Sales referencing Inventory's runtime project.
/// </summary>
public sealed record GetControlledMedicinesQuery : IQuery<IReadOnlyList<ControlledMedicineDto>>;

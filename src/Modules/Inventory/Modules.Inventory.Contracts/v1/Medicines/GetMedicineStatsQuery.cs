using FSH.Modules.Inventory.Contracts.Dtos;
using Mediator;

namespace FSH.Modules.Inventory.Contracts.v1.Medicines;

/// <summary>
/// Tenant-wide inventory counts for the dashboard stat cards. Ported from GET app/api/medicines/stats
/// (getMedicineInventoryStats).
/// </summary>
public sealed record GetMedicineStatsQuery(Guid? BranchId = null) : IQuery<MedicineStatsDto>;

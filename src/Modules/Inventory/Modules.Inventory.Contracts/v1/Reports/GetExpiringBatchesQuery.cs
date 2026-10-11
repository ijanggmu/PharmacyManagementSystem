using FSH.Modules.Inventory.Contracts.Dtos;
using Mediator;

namespace FSH.Modules.Inventory.Contracts.v1.Reports;

public sealed record GetExpiringBatchesQuery(int WithinDays = 90, Guid? BranchId = null) : IQuery<IReadOnlyList<ExpiringBatchDto>>;

using FSH.Framework.Shared.Persistence;
using FSH.Modules.Inventory.Contracts.Dtos;
using Mediator;

namespace FSH.Modules.Inventory.Contracts.v1.Consignment;

public sealed record SearchConsignmentPositionsQuery(
    Guid? SupplierId = null,
    Guid? BranchId = null,
    bool OnlyOutstanding = false,
    int PageNumber = 1,
    int PageSize = 50) : IQuery<PagedResponse<ConsignmentPositionDto>>;

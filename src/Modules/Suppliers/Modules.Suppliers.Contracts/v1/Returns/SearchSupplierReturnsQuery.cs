using FSH.Framework.Shared.Persistence;
using FSH.Modules.Suppliers.Contracts.Dtos;
using Mediator;

namespace FSH.Modules.Suppliers.Contracts.v1.Returns;

public sealed record SearchSupplierReturnsQuery(
    Guid? SupplierId = null,
    int PageNumber = 1,
    int PageSize = 50,
    Guid? BranchId = null) : IQuery<PagedResponse<SupplierReturnDto>>;

using FSH.Framework.Shared.Persistence;
using FSH.Modules.Suppliers.Contracts.Dtos;
using Mediator;

namespace FSH.Modules.Suppliers.Contracts.v1.Suppliers;

public sealed record ListTrashedSuppliersQuery(int PageNumber = 1, int PageSize = 20)
    : IQuery<PagedResponse<SupplierDto>>;

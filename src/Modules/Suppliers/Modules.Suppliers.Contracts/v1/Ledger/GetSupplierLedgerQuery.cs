using FSH.Framework.Shared.Persistence;
using FSH.Modules.Suppliers.Contracts.Dtos;
using Mediator;

namespace FSH.Modules.Suppliers.Contracts.v1.Ledger;

public sealed record GetSupplierLedgerQuery(
    Guid SupplierId,
    int PageNumber = 1,
    int PageSize = 50,
    Guid? BranchId = null) : IQuery<PagedResponse<SupplierLedgerEntryDto>>;

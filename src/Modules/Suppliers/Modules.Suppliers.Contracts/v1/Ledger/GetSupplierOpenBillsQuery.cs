using FSH.Modules.Suppliers.Contracts.Dtos;
using Mediator;

namespace FSH.Modules.Suppliers.Contracts.v1.Ledger;

/// <summary>A supplier's bills, oldest first. <paramref name="OnlyOpen"/> leaves out fully settled bills;
/// <paramref name="BranchId"/> limits the list to bills recorded at that branch (settlement is still worked out
/// across all branches, since a bill can be paid from any of them).</summary>
public sealed record GetSupplierOpenBillsQuery(Guid SupplierId, bool OnlyOpen = true, Guid? BranchId = null)
    : IQuery<SupplierOpenBillsDto>;

using FSH.Modules.Suppliers.Contracts.Dtos;
using Mediator;

namespace FSH.Modules.Suppliers.Contracts.v1.Ledger;

/// <summary>AP statement (opening balance, transactions, closing balance) over a date range — ports
/// <c>supplierStatementReport</c> (supplier-statement-service.ts).</summary>
public sealed record GetSupplierStatementQuery(Guid SupplierId, DateTime FromUtc, DateTime ToUtc, Guid? BranchId = null)
    : IQuery<SupplierStatementDto>;

using FSH.Modules.Customers.Contracts.Dtos;
using Mediator;

namespace FSH.Modules.Customers.Contracts.v1.Ledger;

/// <summary>AR statement for one customer (opening balance, period lines, totals, closing balance, ageing) over a
/// date range — the customer-side twin of the Suppliers module's <c>GetSupplierStatementQuery</c>.</summary>
public sealed record GetCustomerStatementQuery(Guid CustomerId, DateTime FromUtc, DateTime ToUtc, Guid? BranchId = null)
    : IQuery<CustomerStatementDto>;

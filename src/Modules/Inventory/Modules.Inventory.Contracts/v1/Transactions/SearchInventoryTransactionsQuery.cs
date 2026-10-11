using FSH.Framework.Shared.Persistence;
using FSH.Modules.Inventory.Contracts.Dtos;
using Mediator;

namespace FSH.Modules.Inventory.Contracts.v1.Transactions;

/// <summary>
/// Read-only movement history over InventoryTransactions — the .NET equivalent of the source
/// system's GET /api/inventory/transactions (lib/server/services/inventory-transaction-service.ts).
/// <see cref="BranchId"/> mirrors the source's branchId filter now that InventoryTransaction carries
/// a required BranchId (docs/branch-scoping-plan.md).
/// </summary>
public sealed record SearchInventoryTransactionsQuery(
    Guid? MedicineId = null,
    Guid? BranchId = null,
    string? TransactionType = null,
    DateTime? DateFrom = null,
    DateTime? DateTo = null,
    int PageNumber = 1,
    int PageSize = 50) : IQuery<PagedResponse<InventoryTransactionDto>>;

using FSH.Framework.Shared.Persistence;
using FSH.Modules.Inventory.Contracts.Dtos;
using Mediator;

namespace FSH.Modules.Inventory.Contracts.v1.Batches;

/// <summary>
/// Batch search. <see cref="ExcludeRecalled"/> = true drops recalled lots; sale pricing must set it so a
/// recalled lot can never supply a sale price.
/// </summary>
public sealed record SearchBatchesQuery(
    Guid? MedicineId = null,
    Guid? BranchId = null,
    string? Search = null,
    bool? IncludeDisposed = false,
    DateOnly? ExpiringBeforeUtc = null,
    int PageNumber = 1,
    int PageSize = 50,
    bool? ExcludeRecalled = null) : IQuery<PagedResponse<MedicineBatchDto>>;

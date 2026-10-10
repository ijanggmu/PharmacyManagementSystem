using FSH.Modules.Inventory.Contracts.Dtos;
using Mediator;

namespace FSH.Modules.Inventory.Contracts.v1.Reports;

/// <summary>Medicines whose total on-hand quantity across all batches is at or below ReorderLevel.</summary>
public sealed record GetReorderSuggestionsQuery(Guid? BranchId = null) : IQuery<IReadOnlyList<ReorderSuggestionDto>>;

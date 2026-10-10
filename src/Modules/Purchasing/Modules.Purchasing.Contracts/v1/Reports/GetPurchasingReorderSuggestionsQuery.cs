using FSH.Modules.Purchasing.Contracts.Dtos;
using Mediator;

namespace FSH.Modules.Purchasing.Contracts.v1.Reports;

/// <summary>
/// Advisory reorder suggestions for active medicines that have a supplier: medicines at or below their
/// reorder level, out of stock, or on track to run out within the 7-day lead time at recent sales velocity
/// (30-day window, current branch). Nothing is ordered automatically.
/// </summary>
public sealed record GetPurchasingReorderSuggestionsQuery : IQuery<IReadOnlyList<PurchasingReorderSuggestionDto>>;

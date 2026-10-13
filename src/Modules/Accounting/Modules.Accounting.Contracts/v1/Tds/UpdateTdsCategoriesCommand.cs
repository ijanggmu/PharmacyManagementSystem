using FSH.Modules.Accounting.Contracts.Dtos;
using Mediator;

namespace FSH.Modules.Accounting.Contracts.v1.Tds;

/// <summary>
/// Saves the tenant's TDS categories (Finance setup): each input updates the category with its code, or adds it.
/// Categories left out are kept unchanged — deactivate one instead of deleting it (deductions keep a snapshot of
/// their category anyway). Returns the full list afterwards.
/// </summary>
public sealed record UpdateTdsCategoriesCommand(IReadOnlyList<TdsCategoryInput> Categories) : ICommand<IReadOnlyList<TdsCategoryDto>>;

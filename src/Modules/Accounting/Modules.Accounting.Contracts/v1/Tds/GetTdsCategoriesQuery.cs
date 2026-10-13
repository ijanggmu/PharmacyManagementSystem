using FSH.Modules.Accounting.Contracts.Dtos;
using Mediator;

namespace FSH.Modules.Accounting.Contracts.v1.Tds;

/// <summary>The tenant's TDS categories (defaults included until edited), in display order.</summary>
public sealed record GetTdsCategoriesQuery : IQuery<IReadOnlyList<TdsCategoryDto>>;

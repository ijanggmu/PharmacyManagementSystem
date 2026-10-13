using Mediator;

namespace FSH.Modules.Sales.Contracts.v1.PriceLevels;

/// <summary>
/// A price level customers can buy at. Retail is the default and has no row: it is the lot's selling price (the MRP).
/// A level prices every lot at <see cref="DiscountPercent"/> below the lot price, except medicines with an explicit
/// per-unit price on the level (<see cref="PriceLevelDetailDto.Items"/>). A level never prices above the lot price.
/// Prices stay VAT-inclusive, exactly like retail.
/// </summary>
public sealed record PriceLevelDto(
    Guid Id,
    string Name,
    decimal DiscountPercent,
    string? Description,
    bool IsActive,
    int ItemCount,
    int CustomerCount);

/// <summary>An explicit per-base-unit price for one medicine on a level (VAT-inclusive).</summary>
public sealed record PriceLevelItemDto(Guid MedicineId, decimal UnitPrice);

public sealed record PriceLevelDetailDto(
    Guid Id,
    string Name,
    decimal DiscountPercent,
    string? Description,
    bool IsActive,
    IReadOnlyList<PriceLevelItemDto> Items);

/// <summary>Every price level (active ones first, by name). Not paginated: a pharmacy has a handful.</summary>
public sealed record GetPriceLevelsQuery(bool IncludeInactive = false) : IQuery<IReadOnlyList<PriceLevelDto>>;

public sealed record GetPriceLevelByIdQuery(Guid Id) : IQuery<PriceLevelDetailDto>;

public sealed record CreatePriceLevelCommand(string Name, decimal DiscountPercent, string? Description = null) : ICommand<Guid>;

public sealed record UpdatePriceLevelCommand(
    Guid Id, string Name, decimal DiscountPercent, string? Description = null, bool IsActive = true) : ICommand<Unit>;

/// <summary>Sets (or, with a null <paramref name="UnitPrice"/>, removes) a medicine's explicit price on a level.</summary>
public sealed record SetPriceLevelItemCommand(Guid PriceLevelId, Guid MedicineId, decimal? UnitPrice) : ICommand<Unit>;

/// <summary>Assigns a customer to a price level; a null <paramref name="PriceLevelId"/> puts them back on retail.</summary>
public sealed record AssignCustomerPriceLevelCommand(Guid CustomerId, Guid? PriceLevelId) : ICommand<Unit>;

/// <summary>
/// How the till should price a cart: the level that applies (the customer's own, or <paramref name="PriceLevelId"/>
/// when the cashier picked another), its percent and the explicit prices of <paramref name="MedicineIds"/>. The
/// server prices the sale itself with the same rules (CreateSale); this is for display only.
/// </summary>
public sealed record GetPriceQuoteQuery(
    Guid? CustomerId, Guid? PriceLevelId = null, IReadOnlyList<Guid>? MedicineIds = null) : IQuery<PriceQuoteDto>;

/// <summary>The till's pricing for a cart: the customer's own level, the applied level (null = retail: each lot at its
/// own price), its percent below the lot price, and its explicit per-unit prices for the medicines asked about.</summary>
public sealed record PriceQuoteDto(
    Guid? CustomerPriceLevelId,
    string? CustomerPriceLevelName,
    Guid? PriceLevelId,
    string? PriceLevelName,
    decimal DiscountPercent,
    IReadOnlyList<PriceLevelItemDto> Items);

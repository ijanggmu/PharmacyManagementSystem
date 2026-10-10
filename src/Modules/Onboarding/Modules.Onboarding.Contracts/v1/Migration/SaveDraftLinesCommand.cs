using Mediator;

namespace FSH.Modules.Onboarding.Contracts.v1.Migration;

/// <summary>
/// One draft opening-balance line, shaped to cover every category the wizard supports:
/// <list type="bullet">
/// <item>Cash/Bank — <paramref name="Amount"/> only.</item>
/// <item>Customer/Supplier — <paramref name="PartyId"/> (the customer/supplier id) + <paramref name="Amount"/>.</item>
/// <item>Stock — <paramref name="MedicineId"/>, <paramref name="Quantity"/>, <paramref name="UnitCost"/>
/// (+ optional <paramref name="SellingPrice"/>, <paramref name="BatchNo"/>, <paramref name="ExpiryDate"/>).</item>
/// </list>
/// </summary>
public sealed record DraftLineInput(
    Guid? PartyId = null,
    Guid? MedicineId = null,
    decimal? Amount = null,
    decimal? Quantity = null,
    decimal? UnitCost = null,
    decimal? SellingPrice = null,
    string? BatchNo = null,
    DateOnly? ExpiryDate = null,
    string? Description = null);

/// <summary>
/// Saves (replacing any previously saved draft for the same category) the draft opening-balance lines
/// for one category of a Draft migration session — port of the per-category
/// <c>app/api/migration/opening-*</c> routes' input shape, split from immediate posting so a pharmacy
/// can build up the whole picture before committing (<c>CommitMigrationSessionCommand</c>).
/// <paramref name="Category"/> is one of "Cash", "Bank", "Customer", "Supplier", "Stock" (case-insensitive).
/// </summary>
public sealed record SaveDraftLinesCommand(
    Guid SessionId, string Category, IReadOnlyList<DraftLineInput> Lines) : ICommand<int>;

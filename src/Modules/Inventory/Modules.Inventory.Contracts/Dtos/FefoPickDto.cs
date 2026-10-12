namespace FSH.Modules.Inventory.Contracts.Dtos;

/// <summary>
/// One sellable lot, in the same order a sale would actually deduct it from (soonest expiry first,
/// earliest-received first on an expiry tie) — the .NET port of lib/inventory/fefo.ts's
/// <c>FefoPick</c>. Unlike that TypeScript type, <see cref="ExpiryDate"/> here is never null:
/// <c>MedicineBatch.ExpiryDate</c> is a non-nullable <c>DateOnly</c> in this schema, so there is no
/// "undated lots sort last" tier to represent. <see cref="SellingPrice"/> is what a sale charges for units
/// taken from this lot, so a till can show the exact price before the sale is made.
/// </summary>
public sealed record FefoPickDto(
    string BatchNo,
    DateOnly ExpiryDate,
    string? RackLocation,
    decimal QuantityOnHand,
    decimal SellingPrice = 0m);

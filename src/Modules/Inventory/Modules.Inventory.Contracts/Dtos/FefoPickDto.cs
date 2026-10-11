namespace FSH.Modules.Inventory.Contracts.Dtos;

/// <summary>
/// One sellable lot, in the same order a sale would actually deduct it from (soonest expiry first,
/// earliest-received first on an expiry tie) — the .NET port of lib/inventory/fefo.ts's
/// <c>FefoPick</c>. Unlike that TypeScript type, <see cref="ExpiryDate"/> here is never null:
/// <c>MedicineBatch.ExpiryDate</c> is a non-nullable <c>DateOnly</c> in this schema, so there is no
/// "undated lots sort last" tier to represent.
/// <see cref="SellingPrice"/> is the lot's selling price (0 when not set). The POS prices a cart line from
/// the first pick's selling price when above zero, else the medicine's unit price — the same rule the sale
/// is priced by server-side (Sales <c>CreateSaleCommandHandler</c>), so the till and the invoice agree.
/// </summary>
public sealed record FefoPickDto(
    string BatchNo,
    DateOnly ExpiryDate,
    string? RackLocation,
    decimal QuantityOnHand,
    decimal SellingPrice = 0m);

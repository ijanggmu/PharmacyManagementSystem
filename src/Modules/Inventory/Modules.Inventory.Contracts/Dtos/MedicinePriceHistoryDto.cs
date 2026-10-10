namespace FSH.Modules.Inventory.Contracts.Dtos;

/// <summary>
/// One price-list version row — ported from Next.js `medicine_price_history`
/// (scripts/102-price-list-versioning.sql). <c>Status</c> is one of "Scheduled", "Active",
/// "Superseded", "Cancelled".
/// </summary>
public sealed record MedicinePriceHistoryDto(
    Guid Id,
    Guid MedicineId,
    decimal UnitPrice,
    decimal? CostPrice,
    DateOnly EffectiveFrom,
    DateOnly? EffectiveTo,
    string Status,
    string? Reason,
    DateTime CreatedAtUtc);

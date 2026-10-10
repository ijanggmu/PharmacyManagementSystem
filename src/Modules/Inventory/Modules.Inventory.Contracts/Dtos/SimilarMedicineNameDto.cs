namespace FSH.Modules.Inventory.Contracts.Dtos;

/// <summary>
/// LASA (look-alike-sound-alike) match — ported from
/// lib/server/services/medicine-service.ts `findSimilarMedicineNames`. Non-blocking: callers
/// surface this as a warning, never a validation error.
/// </summary>
public sealed record SimilarMedicineNameDto(
    Guid Id,
    string Name,
    string? GenericName,
    int Distance);

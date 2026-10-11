namespace FSH.Modules.Prescriptions.Contracts.Dtos;

/// <summary>
/// Prescription counts by derived fill status. Mirrors the Next.js reference's
/// <c>getPrescriptionStatsForTenant</c> (total/pending/filled/partially_filled/cancelled), adapted to
/// this module's domain: the legacy schema stored fill status directly on the row, this domain derives
/// it from the prescription's status plus each item's dispensed vs. prescribed quantity (see
/// <c>GetPrescriptionStatsQueryHandler</c>).
/// </summary>
public sealed record PrescriptionStatsDto(
    int Total,
    int Pending,
    int PartiallyFilled,
    int Filled,
    int Cancelled);

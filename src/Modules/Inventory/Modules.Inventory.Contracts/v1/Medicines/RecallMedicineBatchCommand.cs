using Mediator;

namespace FSH.Modules.Inventory.Contracts.v1.Medicines;

public sealed record RecallMedicineBatchResult(int Affected);

/// <summary>
/// Ported from POST app/api/medicines/[id]/batches/recall (recallMedicineBatch). Flags every
/// not-yet-disposed lot with this batch number for the medicine, across all branches (a product recall),
/// setting IsRecalled, RecalledAtUtc and RecallReason. QuantityOnHand is unchanged (no write-off). Recalled
/// lots are never deducted or priced for sale. <c>Affected</c> is the number of matching lots.
/// </summary>
public sealed record RecallMedicineBatchCommand(
    Guid MedicineId,
    string BatchNumber,
    string? Reason = null) : ICommand<RecallMedicineBatchResult>;

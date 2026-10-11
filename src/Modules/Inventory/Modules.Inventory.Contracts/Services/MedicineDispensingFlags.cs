namespace FSH.Modules.Inventory.Contracts.Services;

/// <summary>
/// The two medicine flags that decide whether a dispensed line needs a valid prescription:
/// <c>IsControlled</c> (scheduled/narcotic) and <c>PrescriptionRequired</c>.
/// </summary>
public sealed record MedicineDispensingFlags(bool IsControlled, bool PrescriptionRequired);

namespace FSH.Modules.Inventory.Contracts.Services;

/// <summary>
/// The cross-module surface Prescriptions' dispensing-safety policy uses to find out which
/// requested medicines are scheduled/narcotic or prescription-only (root plan §6.2) — Prescriptions
/// references only this Contracts project, never Inventory's runtime.
/// </summary>
public interface IControlledMedicineChecker
{
    /// <summary>Medicine ids present in the result and mapped to <c>true</c> are controlled; ids
    /// absent from the dictionary should be treated as not controlled (e.g. already deleted).</summary>
    ValueTask<IReadOnlyDictionary<Guid, bool>> AreControlledAsync(
        IReadOnlyList<Guid> medicineIds, CancellationToken cancellationToken = default);

    /// <summary>
    /// The <see cref="MedicineDispensingFlags"/> for each requested medicine. Ids absent from the
    /// dictionary (e.g. already deleted) should be treated as having no dispensing requirements.
    /// </summary>
    ValueTask<IReadOnlyDictionary<Guid, MedicineDispensingFlags>> GetDispensingFlagsAsync(
        IReadOnlyList<Guid> medicineIds, CancellationToken cancellationToken = default);
}

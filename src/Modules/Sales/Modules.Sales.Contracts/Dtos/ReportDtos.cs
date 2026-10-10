namespace FSH.Modules.Sales.Contracts.Dtos;

/// <summary>
/// One dispensing line of a controlled-substance sale — see
/// <see cref="FSH.Modules.Sales.Contracts.v1.Reports.GetNarcoticRegisterQuery"/> for the faithfulness
/// gap against the Next.js reference's <c>dda_narcotic_register</c> view (no prescription number,
/// doctor license, schedule, or strength/form in the ported schema).
/// </summary>
public sealed record NarcoticRegisterRowDto(
    Guid SaleId,
    DateTime SaleDateUtc,
    Guid? CustomerId,
    string? CustomerName,
    Guid? PrescriptionId,
    string? DoctorName,
    Guid SaleItemId,
    Guid MedicineId,
    string MedicineName,
    string? GenericName,
    decimal Quantity,
    decimal UnitPrice,
    decimal LineTotal,
    // Branch the medicine was dispensed at (the register is kept per premises).
    Guid? BranchId = null);

namespace FSH.Modules.Inventory.Contracts.Dtos;

public sealed record InventoryTransactionDto(
    Guid Id,
    Guid MedicineId,
    string? MedicineName,
    Guid BranchId,
    Guid? MedicineBatchId,
    string? BatchNo,
    string TransactionType,
    decimal QuantityDelta,
    decimal UnitCostPrice,
    string? ReferenceType,
    Guid? ReferenceId,
    string? Notes,
    DateTime CreatedAtUtc,
    // The referenced document's own number (invoice, GRN, PO, credit / debit note, transfer, count), when
    // it can be looked up; null for references that have none (opening stock, imports, recalls).
    string? ReferenceNumber = null,
    // Who made the movement; null for movements recorded before this was kept, or by background jobs.
    string? CreatedByName = null);

namespace FSH.Modules.Suppliers.Contracts.Dtos;

public sealed record SupplierReturnItemDto(
    Guid Id,
    Guid MedicineId,
    decimal Quantity,
    decimal UnitCost,
    decimal TotalCost,
    string ReturnReason,
    string? Notes);

public sealed record SupplierReturnDto(
    Guid Id,
    Guid SupplierId,
    DateTime ReturnDateUtc,
    string? Notes,
    decimal TotalCost,
    DateTime CreatedAtUtc,
    IReadOnlyList<SupplierReturnItemDto> Items,
    Guid? BranchId = null);

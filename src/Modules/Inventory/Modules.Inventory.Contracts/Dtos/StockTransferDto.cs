namespace FSH.Modules.Inventory.Contracts.Dtos;

public sealed record StockTransferItemDto(Guid MedicineId, string? MedicineName, decimal Quantity);

public sealed record StockTransferDto(
    Guid Id,
    string TransferNumber,
    Guid FromLocationId,
    Guid ToLocationId,
    Guid FromBranchId,
    Guid ToBranchId,
    string Status,
    string? Notes,
    DateTime CreatedAtUtc,
    DateTime? ReceivedAtUtc,
    DateTime? CancelledAtUtc,
    string? CancellationReason,
    IReadOnlyList<StockTransferItemDto> Items);

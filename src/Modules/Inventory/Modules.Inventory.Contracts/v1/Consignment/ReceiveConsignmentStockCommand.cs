using Mediator;

namespace FSH.Modules.Inventory.Contracts.v1.Consignment;

/// <summary>Receives stock owned by the supplier until sold — adds it to inventory (own batch, via
/// the normal stock-receipt path) and opens a <c>ConsignmentPosition</c> tracking what's owed once
/// sold. When omitted, <see cref="BatchNo"/> is generated, <see cref="ExpiryDate"/> means no expiry,
/// and <see cref="SellingPrice"/> falls back to the medicine's default unit price.</summary>
public sealed record ReceiveConsignmentStockCommand(
    Guid SupplierId,
    Guid MedicineId,
    string? BatchNo,
    DateOnly? ExpiryDate,
    decimal Quantity,
    decimal UnitCostPrice,
    decimal? SellingPrice,
    string? RackLocation = null) : ICommand<Guid>;

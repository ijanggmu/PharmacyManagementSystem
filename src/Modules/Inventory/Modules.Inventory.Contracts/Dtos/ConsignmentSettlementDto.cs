namespace FSH.Modules.Inventory.Contracts.Dtos;

/// <summary>One consignment settlement run for a supplier. Carries the amount owed; the stored row
/// does not record a total quantity, so none is returned. <see cref="TotalAmount"/> is net of VAT; the
/// supplier is owed it plus <see cref="VatAmount"/>.</summary>
public sealed record ConsignmentSettlementDto(
    Guid Id,
    Guid SupplierId,
    Guid? BranchId,
    decimal TotalAmount,
    int PositionsSettledCount,
    DateTime SettlementDateUtc,
    string SettledBy,
    DateTime CreatedAtUtc,
    string? SupplierName = null,
    decimal VatAmount = 0m);

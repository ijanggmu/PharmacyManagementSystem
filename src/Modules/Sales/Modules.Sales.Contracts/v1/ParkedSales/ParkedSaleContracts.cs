using Mediator;

namespace FSH.Modules.Sales.Contracts.v1.ParkedSales;

/// <summary>
/// One cart line of a parked (held) bill. <paramref name="Quantity"/> is in base units; a line sold in packs also
/// carries <paramref name="SaleUnit"/> = "pack" and <paramref name="PackCount"/>. <paramref name="UnitPrice"/> and
/// <paramref name="LineTotal"/> are what the till showed when the bill was parked — kept only so a recall can tell
/// the cashier what changed; the sale is always priced again by the server.
/// </summary>
public sealed record ParkedSaleLineDto(
    Guid MedicineId,
    string MedicineName,
    decimal Quantity,
    string? SaleUnit,
    int? PackCount,
    decimal DiscountPercent,
    decimal UnitPrice,
    decimal LineTotal);

/// <summary>A parked bill in the recall list (no lines).</summary>
public sealed record ParkedSaleSummaryDto(
    Guid Id,
    string Label,
    Guid? CustomerId,
    string? CustomerName,
    int LineCount,
    decimal TotalAmount,
    Guid? ParkedByUserId,
    string? ParkedByName,
    DateTime ParkedAtUtc,
    DateTime ExpiresAtUtc);

/// <summary>A parked bill with everything needed to restore the cart.</summary>
public sealed record ParkedSaleDto(
    Guid Id,
    Guid BranchId,
    string Label,
    Guid? CustomerId,
    string? CustomerName,
    Guid? PrescriptionId,
    Guid? PriceLevelId,
    string? BuyerName,
    string? BuyerPan,
    decimal BillDiscountAmount,
    string? Notes,
    decimal TotalAmount,
    IReadOnlyList<ParkedSaleLineDto> Lines,
    Guid? ParkedByUserId,
    string? ParkedByName,
    DateTime ParkedAtUtc,
    DateTime ExpiresAtUtc);

/// <summary>
/// Holds the till's current cart at the current branch so any terminal there can recall it. A parked bill never
/// touches stock or the ledger, and expires after the tenant's <c>pos.parked_bill_expiry_hours</c> (default 24).
/// <paramref name="ClientParkId"/> makes a retried park idempotent.
/// </summary>
public sealed record ParkSaleCommand(
    string? Label,
    IReadOnlyList<ParkedSaleLineDto> Lines,
    decimal TotalAmount,
    Guid? CustomerId = null,
    string? CustomerName = null,
    Guid? PrescriptionId = null,
    Guid? PriceLevelId = null,
    string? BuyerName = null,
    string? BuyerPan = null,
    decimal BillDiscountAmount = 0m,
    string? Notes = null,
    string? ClientParkId = null) : ICommand<ParkedSaleSummaryDto>;

/// <summary>The current branch's parked bills that have not expired, newest first.</summary>
public sealed record GetParkedSalesQuery : IQuery<IReadOnlyList<ParkedSaleSummaryDto>>;

/// <summary>Takes a parked bill off the shelf and returns it: once recalled it is gone, so two terminals can't both
/// ring it up (the second gets 404).</summary>
public sealed record RecallParkedSaleCommand(Guid Id) : ICommand<ParkedSaleDto>;

/// <summary>Discards a parked bill without recalling it.</summary>
public sealed record DiscardParkedSaleCommand(Guid Id) : ICommand<Unit>;

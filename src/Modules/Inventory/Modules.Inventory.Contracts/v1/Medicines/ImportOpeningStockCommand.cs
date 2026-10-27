using Mediator;

namespace FSH.Modules.Inventory.Contracts.v1.Medicines;

/// <summary>
/// One spreadsheet row of stock for a medicine that already exists. The medicine is found by
/// <see cref="MedicineId"/>, else <see cref="Barcode"/>, else <see cref="MedicineName"/> + <see cref="Strength"/> +
/// <see cref="Form"/> (the same identity the medicine form uses). <see cref="RowNumber"/> is the row in the user's
/// file (header = 1). <see cref="SellingPrice"/> null/0 = the medicine's current price.
/// <para>With <see cref="ImportOpeningStockCommand.CreateMissingMedicines"/>, a row whose medicine isn't found creates
/// it from the row: name, strength, form, barcode, <see cref="GenericName"/>, <see cref="SellingPrice"/> (required, the
/// medicine's price), <see cref="CostPrice"/>, <see cref="IsTaxable"/> (null = VAT-exempt), <see cref="UnitsPerPack"/> and
/// <see cref="ReorderLevel"/>. <see cref="ConsignmentSupplierId"/> receives this row as that supplier's consigned
/// stock (see the command).</para>
/// </summary>
public sealed record OpeningStockImportRow(
    int RowNumber,
    Guid? MedicineId = null,
    string? Barcode = null,
    string? MedicineName = null,
    string? Strength = null,
    string? Form = null,
    string? BatchNo = null,
    DateOnly? ExpiryDate = null,
    decimal Quantity = 0m,
    decimal CostPrice = 0m,
    decimal? SellingPrice = null,
    string? RackLocation = null,
    string? GenericName = null,
    bool? IsTaxable = null,
    int? UnitsPerPack = null,
    decimal? ReorderLevel = null,
    Guid? ConsignmentSupplierId = null);

/// <summary>
/// Receives a spreadsheet of stock for existing medicines at the current branch, all-or-nothing per file: every row
/// is validated and its medicine and lot resolved before anything is written; if any row fails nothing is received.
/// <see cref="DryRun"/> returns the plan without writing (the preview).
/// <para>The stock goes through the same receipt path as adding stock to one medicine (lots topped up or opened,
/// <c>Purchase</c> inventory transactions), and its total value posts one
/// <c>OpeningStockReceivedIntegrationEvent</c> with <see cref="Funding"/> (<c>StockFundingSources</c>): opening stock
/// (the default) is Dr Inventory / Cr Owner's Equity; <c>cash</c> / <c>bank</c> is stock bought without a supplier
/// bill, Dr Inventory / Cr Cash or Bank. Dated at <see cref="AsOfDate"/> (null = today).</para>
/// <para>With <see cref="ConsignmentSupplierId"/> the file is that supplier's consigned stock instead: every row
/// opens its own lot with a consignment position (the same as receiving consignment one medicine at a time), no
/// voucher posts, and the supplier is billed only for what sells, at settlement. <see cref="Funding"/> must be left
/// out, and a batch number already in stock is refused rather than topped up. A row's own
/// <see cref="OpeningStockImportRow.ConsignmentSupplierId"/> does the same for just that row, so one go-live file can
/// hold owned and consigned stock.</para>
/// <para><see cref="CreateMissingMedicines"/> (go-live setup) adds medicines the file names but the list doesn't have,
/// instead of failing those rows. It also lets a row leave the quantity at 0: the row then only adds the medicine card
/// (<see cref="OpeningStockImportRowStatuses.CardOnly"/>), with no lot and nothing in the voucher, so a pharmacy can
/// bring its whole medicine list, out-of-stock items included. A new medicine with no form is saved as
/// <see cref="OpeningStockImportDefaults.Form"/>.</para>
/// </summary>
public sealed record ImportOpeningStockCommand(
    IReadOnlyList<OpeningStockImportRow> Rows,
    string? Funding = null,
    DateOnly? AsOfDate = null,
    bool DryRun = false,
    Guid? ConsignmentSupplierId = null,
    bool CreateMissingMedicines = false) : ICommand<OpeningStockImportResult>;

/// <summary><see cref="OpeningStockImportResult.Funding"/> of a consignment import (no voucher, so no funding source).</summary>
public static class OpeningStockImportModes
{
    public const string Consignment = "consignment";
}

public static class OpeningStockImportRowStatuses
{
    public const string Received = "received";
    public const string Failed = "failed";

    /// <summary>Go-live row with no quantity: only the medicine card is added (or nothing, when it's already in the list).</summary>
    public const string CardOnly = "card_only";
}

public static class OpeningStockImportDefaults
{
    /// <summary>The form a go-live row's new medicine gets when the file leaves it blank.</summary>
    public const string Form = "Other";
}

/// <summary>One problem with one cell: <see cref="Field"/> is the template's column key (e.g. <c>batch_no</c>).</summary>
public sealed record OpeningStockImportError(string Field, string Message);

/// <summary>A row's outcome: the medicine it matched (id + label for the preview) and, once committed, the lot.</summary>
public sealed record OpeningStockImportRowResult(
    int RowNumber,
    string Status,
    Guid? MedicineId,
    string? MedicineLabel,
    Guid? BatchId,
    IReadOnlyList<OpeningStockImportError> Errors,
    IReadOnlyList<string> Warnings,
    bool NewMedicine = false,
    bool Consigned = false);

/// <summary><see cref="Committed"/> is true only when the stock was received (not a dry run, and no row failed).
/// <see cref="MedicinesOnly"/> counts the <see cref="OpeningStockImportRowStatuses.CardOnly"/> rows, which are not
/// in <see cref="Received"/>, <see cref="TotalQuantity"/> or <see cref="TotalValue"/>.</summary>
public sealed record OpeningStockImportResult(
    bool Committed,
    bool DryRun,
    int Received,
    int Failed,
    decimal TotalQuantity,
    decimal TotalValue,
    string Funding,
    IReadOnlyList<OpeningStockImportRowResult> Rows,
    int MedicinesOnly = 0);

public static class OpeningStockImportLimits
{
    /// <summary>Most rows one file may carry.</summary>
    public const int MaxRows = 2000;

    /// <summary>Largest quantity on one row (a typo guard).</summary>
    public const decimal MaxQuantity = 1_000_000m;
}

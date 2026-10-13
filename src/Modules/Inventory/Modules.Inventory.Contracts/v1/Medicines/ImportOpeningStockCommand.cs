using Mediator;

namespace FSH.Modules.Inventory.Contracts.v1.Medicines;

/// <summary>
/// One spreadsheet row of stock for a medicine that already exists. The medicine is found by
/// <see cref="MedicineId"/>, else <see cref="Barcode"/>, else <see cref="MedicineName"/> + <see cref="Strength"/> +
/// <see cref="Form"/> (the same identity the medicine form uses). <see cref="RowNumber"/> is the row in the user's
/// file (header = 1). <see cref="SellingPrice"/> null/0 = the medicine's current price.
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
    string? RackLocation = null);

/// <summary>
/// Receives a spreadsheet of stock for existing medicines at the current branch, all-or-nothing per file: every row
/// is validated and its medicine and lot resolved before anything is written; if any row fails nothing is received.
/// <see cref="DryRun"/> returns the plan without writing (the preview).
/// <para>The stock goes through the same receipt path as adding stock to one medicine (lots topped up or opened,
/// <c>Purchase</c> inventory transactions), and its total value posts one
/// <c>OpeningStockReceivedIntegrationEvent</c> with <see cref="Funding"/> (<c>StockFundingSources</c>): opening stock
/// (the default) is Dr Inventory / Cr Owner's Equity; <c>cash</c> / <c>bank</c> is stock bought without a supplier
/// bill, Dr Inventory / Cr Cash or Bank. Dated at <see cref="AsOfDate"/> (null = today).</para>
/// </summary>
public sealed record ImportOpeningStockCommand(
    IReadOnlyList<OpeningStockImportRow> Rows,
    string? Funding = null,
    DateOnly? AsOfDate = null,
    bool DryRun = false) : ICommand<OpeningStockImportResult>;

public static class OpeningStockImportRowStatuses
{
    public const string Received = "received";
    public const string Failed = "failed";
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
    IReadOnlyList<string> Warnings);

/// <summary><see cref="Committed"/> is true only when the stock was received (not a dry run, and no row failed).</summary>
public sealed record OpeningStockImportResult(
    bool Committed,
    bool DryRun,
    int Received,
    int Failed,
    decimal TotalQuantity,
    decimal TotalValue,
    string Funding,
    IReadOnlyList<OpeningStockImportRowResult> Rows);

public static class OpeningStockImportLimits
{
    /// <summary>Most rows one file may carry.</summary>
    public const int MaxRows = 2000;

    /// <summary>Largest quantity on one row (a typo guard).</summary>
    public const decimal MaxQuantity = 1_000_000m;
}

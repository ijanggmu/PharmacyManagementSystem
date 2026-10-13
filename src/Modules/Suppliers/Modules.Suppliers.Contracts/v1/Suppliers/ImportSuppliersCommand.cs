using Mediator;

namespace FSH.Modules.Suppliers.Contracts.v1.Suppliers;

/// <summary>What to do with a file row that matches a supplier who already exists (same PAN / VAT no. or name).</summary>
public static class SupplierImportDuplicateModes
{
    /// <summary>Leave the existing supplier untouched and report the row as skipped (the default).</summary>
    public const string Skip = "skip";

    /// <summary>Overwrite the existing supplier's details with the row's non-blank values (never its name).</summary>
    public const string Update = "update";

    public static bool IsKnown(string? mode) =>
        string.Equals(mode, Skip, StringComparison.OrdinalIgnoreCase)
        || string.Equals(mode, Update, StringComparison.OrdinalIgnoreCase);
}

/// <summary>
/// One spreadsheet row. <see cref="RowNumber"/> is the row in the user's file (header = 1). <see cref="OpeningBalance"/>
/// is signed: positive = the pharmacy owes the supplier (opening payable), negative = an advance paid to them.
/// <see cref="AsOfDate"/> dates that balance; null = the command's <see cref="ImportSuppliersCommand.AsOfDate"/>, else today.
/// </summary>
public sealed record SupplierImportRow(
    int RowNumber,
    string? Name,
    string? ContactPerson = null,
    string? Phone = null,
    string? Email = null,
    string? Address = null,
    string? PanNumber = null,
    int? CreditDays = null,
    decimal? OpeningBalance = null,
    DateOnly? AsOfDate = null);

/// <summary>
/// Imports suppliers from a spreadsheet, all-or-nothing: every row is validated (fields, duplicates inside the file,
/// matches with existing suppliers by PAN or name) before anything is written; if any row fails nothing is saved.
/// <see cref="DryRun"/> returns the plan without writing (the preview). Opening payables go through the same AP-ledger
/// + <c>SupplierOpeningBalanceRecordedIntegrationEvent</c> path as creating one supplier.
/// </summary>
public sealed record ImportSuppliersCommand(
    IReadOnlyList<SupplierImportRow> Rows,
    string DuplicateMode = SupplierImportDuplicateModes.Skip,
    DateOnly? AsOfDate = null,
    bool DryRun = false) : ICommand<SupplierImportResult>;

/// <summary>Row statuses in an import result (for a dry run: what would happen).</summary>
public static class SupplierImportRowStatuses
{
    public const string Created = "created";
    public const string Updated = "updated";
    public const string Skipped = "skipped";
    public const string Failed = "failed";
}

/// <summary>One problem with one cell: <see cref="Field"/> is the template's column key (e.g. <c>pan</c>).</summary>
public sealed record SupplierImportError(string Field, string Message);

public sealed record SupplierImportRowResult(
    int RowNumber,
    string Status,
    Guid? SupplierId,
    IReadOnlyList<SupplierImportError> Errors,
    IReadOnlyList<string> Warnings);

/// <summary><see cref="Committed"/> is true only when the rows were saved (not a dry run, and no row failed).</summary>
public sealed record SupplierImportResult(
    bool Committed,
    bool DryRun,
    int Created,
    int Updated,
    int Skipped,
    int Failed,
    IReadOnlyList<SupplierImportRowResult> Rows);

public static class SupplierImportLimits
{
    /// <summary>Most rows one file may carry.</summary>
    public const int MaxRows = 2000;

    /// <summary>Largest opening balance (either sign) accepted per supplier: 1 crore rupees (a typo guard; it posts to the GL).</summary>
    public const decimal MaxOpeningBalance = 10_000_000m;
}

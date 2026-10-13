using Mediator;

namespace FSH.Modules.Customers.Contracts.v1.Customers;

/// <summary>What to do with a file row that matches a customer who already exists (same phone or PAN).</summary>
public static class CustomerImportDuplicateModes
{
    /// <summary>Leave the existing customer untouched and report the row as skipped (the default).</summary>
    public const string Skip = "skip";

    /// <summary>Overwrite the existing customer's profile with the row's non-blank values.</summary>
    public const string Update = "update";

    public static bool IsKnown(string? mode) =>
        string.Equals(mode, Skip, StringComparison.OrdinalIgnoreCase)
        || string.Equals(mode, Update, StringComparison.OrdinalIgnoreCase);
}

/// <summary>
/// One spreadsheet row. <see cref="RowNumber"/> is the row in the user's file (header = 1), echoed back in the
/// result so errors point at the right line. <see cref="OpeningBalance"/> is signed: positive = the customer owes
/// the pharmacy, negative = an advance held for them. <see cref="AsOfDate"/> dates that balance; null = the
/// command's <see cref="ImportCustomersCommand.AsOfDate"/>, else today.
/// </summary>
public sealed record CustomerImportRow(
    int RowNumber,
    string? Name,
    string? Phone = null,
    string? Email = null,
    string? Address = null,
    string? PanNumber = null,
    decimal? CreditLimit = null,
    int? CreditDays = null,
    decimal? OpeningBalance = null,
    DateOnly? AsOfDate = null);

/// <summary>
/// Imports customers from a spreadsheet, all-or-nothing: every row is validated (fields, duplicates inside the file,
/// matches with existing customers) before anything is written, and if any row fails nothing is saved — the result
/// lists each row's errors instead. <see cref="DryRun"/> runs the same checks and returns the plan without writing
/// (the preview). Opening balances go through the same AR-ledger + <c>CustomerOpeningBalanceRecordedIntegrationEvent</c>
/// path as creating one customer, so the AR subledger and the GL stay reconciled.
/// </summary>
public sealed record ImportCustomersCommand(
    IReadOnlyList<CustomerImportRow> Rows,
    string DuplicateMode = CustomerImportDuplicateModes.Skip,
    DateOnly? AsOfDate = null,
    bool DryRun = false) : ICommand<CustomerImportResult>;

/// <summary>Row statuses in an import result (for a dry run: what would happen).</summary>
public static class CustomerImportRowStatuses
{
    public const string Created = "created";
    public const string Updated = "updated";
    public const string Skipped = "skipped";
    public const string Failed = "failed";
}

/// <summary>One problem with one cell: <see cref="Field"/> is the template's column key (e.g. <c>phone</c>).</summary>
public sealed record CustomerImportError(string Field, string Message);

public sealed record CustomerImportRowResult(
    int RowNumber,
    string Status,
    Guid? CustomerId,
    IReadOnlyList<CustomerImportError> Errors,
    IReadOnlyList<string> Warnings);

/// <summary>
/// <see cref="Committed"/> is true only when the rows were saved (not a dry run, and no row failed).
/// </summary>
public sealed record CustomerImportResult(
    bool Committed,
    bool DryRun,
    int Created,
    int Updated,
    int Skipped,
    int Failed,
    IReadOnlyList<CustomerImportRowResult> Rows);

public static class CustomerImportLimits
{
    /// <summary>Most rows one file may carry; bigger lists are split into several files.</summary>
    public const int MaxRows = 2000;
}

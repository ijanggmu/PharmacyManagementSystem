namespace FSH.Modules.Accounting.Contracts.Dtos;

/// <summary>A TDS (withholding tax) category: stable <see cref="Code"/>, display name and the rate (percent of the
/// taxable amount excluding VAT) pre-filled on an expense or supplier payment.</summary>
public sealed record TdsCategoryDto(string Code, string Name, decimal RatePercent, bool IsActive, int SortOrder);

/// <summary>One TDS deduction in the period. <see cref="SourceType"/> is <c>Expense</c> or <c>SupplierPayment</c>;
/// <see cref="SourceId"/> the expense id or the supplier payment's ledger entry id.</summary>
public sealed record TdsReportLineDto(
    Guid Id,
    DateTime DeductionDateUtc,
    string SourceType,
    Guid SourceId,
    string VendorName,
    string? Pan,
    string CategoryCode,
    string CategoryName,
    decimal RatePercent,
    decimal TaxableAmount,
    decimal TdsAmount,
    string? DocumentReference,
    Guid? BranchId);

/// <summary>Totals of one TDS category in the period.</summary>
public sealed record TdsReportCategoryTotalDto(
    string CategoryCode,
    string CategoryName,
    int Count,
    decimal TaxableAmount,
    decimal TdsAmount);

/// <summary>
/// TDS deducted in [<see cref="FromUtc"/>, <see cref="ToUtc"/>]: every deduction, totals per category and overall,
/// the TDS deposited with IRD in the period (TDS payments) and the TDS Payable balance at the end of the period
/// (tenant-wide — TDS is deposited per PAN, not per branch).
/// </summary>
public sealed record TdsReportDto(
    DateTime FromUtc,
    DateTime ToUtc,
    IReadOnlyList<TdsReportLineDto> Lines,
    IReadOnlyList<TdsReportCategoryTotalDto> CategoryTotals,
    decimal TotalTaxableAmount,
    decimal TotalTdsAmount,
    decimal TdsDeposited,
    decimal TdsPayableBalance);

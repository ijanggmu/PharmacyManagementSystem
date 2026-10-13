namespace FSH.Modules.Accounting.Contracts.Dtos;

/// <summary>String values the fixed asset API takes and returns for its enumerations.</summary>
public static class FixedAssetValues
{
    /// <summary>Book depreciation methods.</summary>
    public static class Methods
    {
        /// <summary>Straight line: (cost − residual) spread evenly over the useful life, month by month.</summary>
        public const string StraightLine = "straight_line";

        /// <summary>Written-down value (diminishing balance): a fixed rate on the net book value at the start of each
        /// fiscal year, spread evenly over its months, never below the residual value.</summary>
        public const string WrittenDownValue = "written_down_value";
    }

    /// <summary>How an asset was acquired, which decides the credit side of its acquisition voucher.</summary>
    public static class Sources
    {
        /// <summary>Paid now: Cr the money account the payment method maps to (cash, bank, wallet).</summary>
        public const string CashBank = "cash_bank";

        /// <summary>A supplier bill to pay later: Cr Accounts Payable, and the bill goes on the supplier's AP ledger.</summary>
        public const string Supplier = "supplier";

        /// <summary>Owned before go-live: Dr cost / Cr Accumulated Depreciation (depreciation to date) / Cr Owner's
        /// Equity (the opening plug, like every other opening balance).</summary>
        public const string Opening = "opening";
    }

    /// <summary>How an asset left the register.</summary>
    public static class DisposalKinds
    {
        public const string Sale = "sale";
        public const string WriteOff = "write_off";
    }

    public static class Statuses
    {
        public const string Active = "active";
        public const string Disposed = "disposed";
    }
}

/// <summary>A Nepal Income Tax Act 2058 Schedule 2 depreciation pool and its default rate.</summary>
public sealed record TaxPoolDto(string Code, string Name, decimal RatePercent, bool PerAssetUsefulLife, string Examples);

/// <summary>One asset in the fixed asset register, with its book position from the ledger: cost, accumulated
/// depreciation (the opening depreciation to date + every posted depreciation month) and net book value.</summary>
public sealed record FixedAssetDto(
    Guid Id,
    string Name,
    string Category,
    string? AssetTag,
    string? Location,
    Guid? BranchId,
    DateTime AcquisitionDateUtc,
    string AcquisitionSource,
    string? PaymentMethod,
    Guid? SupplierId,
    string? VendorName,
    string? SupplierVatNumber,
    string? BillNumber,
    decimal Cost,
    decimal VatAmount,
    decimal ResidualValue,
    string DepreciationMethod,
    int? UsefulLifeMonths,
    decimal? RatePercent,
    string TaxPool,
    int? TaxUsefulLifeYears,
    decimal OpeningAccumulatedDepreciation,
    decimal? OpeningTaxWrittenDownValue,
    decimal AccumulatedDepreciation,
    decimal NetBookValue,
    // Fiscal period the last posted depreciation month belongs to ("Ashwin 2083"), null when none.
    string? DepreciatedThrough,
    bool HasPostedDepreciation,
    string Status,
    DateTime? DisposedOnUtc,
    string? DisposalKind,
    decimal? DisposalProceeds,
    decimal? DisposalGainLoss,
    string? Notes,
    string CreatedBy,
    DateTime CreatedAtUtc);

/// <summary>One asset's depreciation in a depreciation preview: the months of the period not yet posted for it and
/// their total.</summary>
public sealed record DepreciationPreviewLineDto(
    Guid AssetId,
    string AssetName,
    string Category,
    Guid? BranchId,
    string Method,
    decimal Cost,
    decimal AccumulatedBefore,
    int Months,
    decimal Amount,
    decimal NetBookValueAfter);

/// <summary>Per-branch total of a depreciation preview: one voucher is posted per branch.</summary>
public sealed record DepreciationPreviewBranchDto(Guid? BranchId, int AssetCount, decimal Amount);

/// <summary>
/// What a depreciation run for the period would post: Dr Depreciation Expense / Cr Accumulated Depreciation per branch,
/// for every active asset month in [<see cref="FromMonth"/>, <see cref="ToMonth"/>] of fiscal year
/// <see cref="FiscalYear"/> (1 = Shrawan … 12 = Ashadh) not already posted. <see cref="CanPost"/> is false, with
/// <see cref="Blocker"/> saying why, when the period has not ended, is in a locked period, or has nothing left to post.
/// </summary>
public sealed record DepreciationPreviewDto(
    int FiscalYear,
    string FiscalYearLabel,
    int FromMonth,
    int ToMonth,
    string PeriodLabel,
    DateOnly PeriodStart,
    DateOnly PeriodEnd,
    IReadOnlyList<DepreciationPreviewLineDto> Lines,
    IReadOnlyList<DepreciationPreviewBranchDto> Branches,
    decimal TotalAmount,
    int AlreadyPostedMonths,
    bool CanPost,
    string? Blocker);

/// <summary>Outcome of a depreciation run: the runs (one per branch) and vouchers posted; empty when the period had
/// nothing left to post (a repeated run is a no-op).</summary>
public sealed record DepreciationRunResultDto(
    int FiscalYear,
    int FromMonth,
    int ToMonth,
    IReadOnlyList<Guid> RunIds,
    IReadOnlyList<Guid> VoucherIds,
    decimal TotalAmount,
    int AssetMonths);

/// <summary>A posted depreciation run (one branch, one period).</summary>
public sealed record DepreciationRunDto(
    Guid Id,
    int FiscalYear,
    int FromMonth,
    int ToMonth,
    string PeriodLabel,
    Guid? BranchId,
    decimal TotalAmount,
    int AssetCount,
    Guid? VoucherId,
    string? VoucherNo,
    DateTime PostedAtUtc,
    string PostedBy,
    DateTime? ReversedAtUtc,
    string? ReversedBy);

/// <summary>One asset's book depreciation over a fiscal year: the twelve monthly amounts (Shrawan … Ashadh; posted
/// where <see cref="PostedMonths"/> says so, else the schedule's projection), and the year's movement in net book
/// value.</summary>
public sealed record DepreciationScheduleRowDto(
    Guid AssetId,
    string AssetName,
    string Category,
    string? AssetTag,
    Guid? BranchId,
    string Method,
    decimal OpeningCost,
    decimal Additions,
    decimal Disposals,
    decimal ClosingCost,
    decimal OpeningAccumulated,
    decimal DepreciationForYear,
    decimal DepreciationPosted,
    decimal AccumulatedOnDisposal,
    decimal ClosingAccumulated,
    decimal OpeningNetBookValue,
    decimal ClosingNetBookValue,
    IReadOnlyList<decimal> Months,
    IReadOnlyList<bool> PostedMonths);

/// <summary>Book depreciation schedule of fiscal year <see cref="FiscalYear"/> (cost and accumulated depreciation
/// roll-forward per asset, the monthly charge, and totals).</summary>
public sealed record DepreciationScheduleDto(
    int FiscalYear,
    string FiscalYearLabel,
    DateOnly YearStart,
    DateOnly YearEnd,
    IReadOnlyList<DepreciationScheduleRowDto> Rows,
    decimal TotalDepreciation,
    decimal TotalPosted,
    decimal TotalClosingNetBookValue);

/// <summary>
/// One Schedule 2 pool in the tax depreciation schedule for an income year. Depreciation base = opening base +
/// additions (in full if acquired Shrawan–Poush, 2/3 if Magh–Chaitra, 1/3 if Baisakh–Ashadh) − disposal proceeds;
/// depreciation = base × rate; the part of the year's additions not yet in the base (1/3 or 2/3) is carried into next
/// year's opening base. A negative base is taxable income (recapture) and resets to zero; a pool with no assets left
/// at the year end deducts what remains (terminal deduction). Pool E is computed asset by asset over its useful life.
/// </summary>
public sealed record TaxPoolScheduleRowDto(
    string Pool,
    string PoolName,
    decimal RatePercent,
    decimal OpeningBase,
    decimal AdditionsFull,
    decimal AdditionsTwoThirds,
    decimal AdditionsOneThird,
    decimal AdditionsIncluded,
    decimal DisposalProceeds,
    decimal DepreciationBase,
    decimal Depreciation,
    decimal Recapture,
    decimal TerminalDeduction,
    decimal DeferredAdditions,
    decimal ClosingBase,
    int AssetCount);

/// <summary>Tax depreciation pool schedule for the income tax return of fiscal year <see cref="FiscalYear"/>.</summary>
public sealed record TaxDepreciationScheduleDto(
    int FiscalYear,
    string FiscalYearLabel,
    IReadOnlyList<TaxPoolScheduleRowDto> Pools,
    decimal TotalDepreciation,
    decimal TotalRecapture,
    decimal TotalTerminalDeduction,
    string Note);

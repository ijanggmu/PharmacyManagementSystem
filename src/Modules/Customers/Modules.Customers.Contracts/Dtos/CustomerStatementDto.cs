namespace FSH.Modules.Customers.Contracts.Dtos;

/// <summary>One ledger line within a customer statement period. <see cref="RunningBalance"/> is recomputed in
/// date order from the period's opening balance; <see cref="DueDateUtc"/> is the debit's effective due date
/// (its own, or the entry date plus the customer's current credit days), null for credits.</summary>
public sealed record CustomerStatementLineDto(
    Guid Id,
    DateTime EntryDateUtc,
    string EntryType,
    string? Description,
    string? DocumentNumber,
    decimal DebitAmount,
    decimal CreditAmount,
    decimal RunningBalance,
    bool IsVoided,
    DateTime? DueDateUtc);

/// <summary>What the customer owed as of the statement's end date, bucketed by the age of each still-open debit
/// (FIFO settlement). <see cref="UnappliedAdvance"/> is credit on account not yet used against a debit;
/// <see cref="NetBalance"/> = buckets minus advance. <see cref="OverdueAmount"/> is the open amount already past
/// its due date; <see cref="EarliestDueDateUtc"/> the earliest due date among the open debits (null when none
/// has one).</summary>
public sealed record CustomerStatementAgeingDto(
    decimal Current,
    decimal Days31To60,
    decimal Days61To90,
    decimal Over90,
    decimal UnappliedAdvance,
    decimal NetBalance,
    decimal OverdueAmount = 0m,
    DateTime? EarliestDueDateUtc = null);

/// <summary>A printable AR statement for one customer over a period: opening balance, the period's lines,
/// period totals, closing balance and ageing as of the period end.</summary>
public sealed record CustomerStatementDto(
    Guid CustomerId,
    string CustomerName,
    string CustomerCode,
    string? Phone,
    string? PanNumber,
    decimal? CreditLimit,
    int? CreditDays,
    DateTime PeriodFromUtc,
    DateTime PeriodToUtc,
    decimal OpeningBalance,
    decimal TotalDebits,
    decimal TotalCredits,
    decimal ClosingBalance,
    IReadOnlyList<CustomerStatementLineDto> Lines,
    CustomerStatementAgeingDto Ageing);

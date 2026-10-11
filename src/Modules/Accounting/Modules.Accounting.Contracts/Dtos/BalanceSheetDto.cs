namespace FSH.Modules.Accounting.Contracts.Dtos;

public sealed record BalanceSheetSectionDto(IReadOnlyList<TrialBalanceLineDto> Lines, decimal Total);

/// <summary>
/// This system has no period-close process, so <see cref="CurrentEarnings"/> (revenue minus expense,
/// posted-to-date) stands in for retained earnings for the period, folded into the balance check
/// rather than the Equity section itself. <see cref="IsBalanced"/> allows a one-cent rounding
/// tolerance.
/// </summary>
public sealed record BalanceSheetDto(
    DateTime AsOfUtc,
    BalanceSheetSectionDto Assets,
    BalanceSheetSectionDto Liabilities,
    BalanceSheetSectionDto Equity,
    decimal CurrentEarnings,
    bool IsBalanced);

namespace FSH.Modules.Accounting.Contracts.Dtos;

public sealed record BalanceSheetSectionDto(IReadOnlyList<TrialBalanceLineDto> Lines, decimal Total);

/// <summary>
/// Balance sheet as of <see cref="AsOfUtc"/>, including year-end closing vouchers dated up to then.
/// <list type="bullet">
/// <item><see cref="Equity"/> lists every equity account, including Retained Earnings (code 3900), which holds the
/// profit or loss of every closed fiscal year; <see cref="RetainedEarnings"/> repeats that account's balance.</item>
/// <item><see cref="CurrentEarnings"/> is the unclosed profit or loss — revenue minus expense not yet transferred by a
/// year-end close (the current year, plus any earlier year still open) — folded into the balance check rather than
/// the Equity section itself.</item>
/// </list>
/// <see cref="IsBalanced"/> allows a one-cent rounding tolerance.
/// </summary>
public sealed record BalanceSheetDto(
    DateTime AsOfUtc,
    BalanceSheetSectionDto Assets,
    BalanceSheetSectionDto Liabilities,
    BalanceSheetSectionDto Equity,
    decimal CurrentEarnings,
    bool IsBalanced,
    decimal RetainedEarnings = 0m);

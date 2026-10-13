using FSH.Modules.Accounting.Contracts.Dtos;
using Mediator;

namespace FSH.Modules.Accounting.Contracts.v1.FiscalYears;

/// <summary>
/// Closes fiscal year <paramref name="FiscalYear"/> (the BS year it started in, e.g. 2082 for 2082/83): posts one
/// closing voucher per branch, dated the year's last day, that zeroes every revenue and expense account into
/// Retained Earnings; records the close; and moves the posting lock to at least the year's last day. Refused for a
/// year that has not ended, one already closed, or while an earlier year with revenue or expense activity is still open.
/// </summary>
public sealed record CloseFiscalYearCommand(int FiscalYear) : ICommand<FiscalYearCloseResultDto>;

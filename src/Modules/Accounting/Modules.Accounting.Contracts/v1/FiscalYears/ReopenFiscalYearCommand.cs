using FSH.Modules.Accounting.Contracts.Dtos;
using Mediator;

namespace FSH.Modules.Accounting.Contracts.v1.FiscalYears;

/// <summary>
/// Reopens a closed fiscal year: reverses its closing vouchers (on the same date, so the year's revenue and expense
/// balances come back) and deletes the close record. Only the latest closed year can be reopened. The posting lock
/// is left as it is — move or clear it separately to post into the year again.
/// </summary>
public sealed record ReopenFiscalYearCommand(int FiscalYear) : ICommand<FiscalYearReopenResultDto>;

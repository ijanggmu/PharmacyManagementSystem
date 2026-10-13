using FSH.Modules.Accounting.Contracts.Dtos;
using Mediator;

namespace FSH.Modules.Accounting.Contracts.v1.FiscalYears;

/// <summary>Every fiscal year from the first one with ledger activity up to the current one, newest first, with its
/// close status.</summary>
public sealed record GetFiscalYearsQuery : IQuery<IReadOnlyList<FiscalYearStatusDto>>;

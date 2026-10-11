using Mediator;

namespace FSH.Modules.Sales.Contracts.v1.CashShifts;

/// <summary>Opens a new till session. Rejected (409) if a shift is already open — only one open cash
/// shift is allowed at a time.</summary>
public sealed record StartCashShiftCommand(decimal OpeningFloat, string? Notes = null) : ICommand<Guid>;

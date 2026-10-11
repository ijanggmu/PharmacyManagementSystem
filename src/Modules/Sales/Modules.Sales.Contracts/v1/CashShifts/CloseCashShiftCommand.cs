using Mediator;

namespace FSH.Modules.Sales.Contracts.v1.CashShifts;

/// <summary>Closes an open shift. <see cref="ClosingNotes"/> is optional (max 1000) and is stored on the shift.</summary>
public sealed record CloseCashShiftCommand(Guid CashShiftId, decimal ClosingCashCounted, string? ClosingNotes = null) : ICommand<Guid>;

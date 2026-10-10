using FSH.Modules.Sales.Contracts.Dtos;
using Mediator;

namespace FSH.Modules.Sales.Contracts.v1.CashShifts;

/// <summary>Returns the currently open shift, or throws <c>NotFoundException</c> (404) if none is
/// open.</summary>
public sealed record GetCurrentCashShiftQuery : IQuery<CashShiftDto>;

using FSH.Modules.Sales.Contracts.Dtos;
using Mediator;

namespace FSH.Modules.Sales.Contracts.v1.CashShifts;

public sealed record GetCashShiftByIdQuery(Guid CashShiftId) : IQuery<CashShiftDto>;

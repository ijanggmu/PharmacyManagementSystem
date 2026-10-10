using FSH.Modules.Sales.Contracts.Dtos;
using Mediator;

namespace FSH.Modules.Sales.Contracts.v1.CashShifts;

public sealed record GetCashShiftSummaryQuery(Guid CashShiftId) : IQuery<CashShiftSummaryDto>;

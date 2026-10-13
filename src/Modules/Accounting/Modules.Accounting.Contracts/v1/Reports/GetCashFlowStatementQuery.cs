using FSH.Modules.Accounting.Contracts.Dtos;
using Mediator;

namespace FSH.Modules.Accounting.Contracts.v1.Reports;

/// <summary>Cash flow statement (indirect method) for a period.</summary>
public sealed record GetCashFlowStatementQuery(DateTime FromUtc, DateTime ToUtc, Guid? BranchId = null) : IQuery<CashFlowStatementDto>;

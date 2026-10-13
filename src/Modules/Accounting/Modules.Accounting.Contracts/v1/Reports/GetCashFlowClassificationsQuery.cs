using FSH.Modules.Accounting.Contracts.Dtos;
using Mediator;

namespace FSH.Modules.Accounting.Contracts.v1.Reports;

/// <summary>Every account with its cash flow classification (tag, default and effective activity).</summary>
public sealed record GetCashFlowClassificationsQuery : IQuery<IReadOnlyList<CashFlowClassificationDto>>;

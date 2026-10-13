using FSH.Modules.Accounting.Contracts.Dtos;
using Mediator;

namespace FSH.Modules.Accounting.Contracts.v1.Reports;

/// <summary>Sets (or, with a null activity, clears) the cash flow tag of each listed account.</summary>
public sealed record UpdateCashFlowClassificationsCommand(IReadOnlyList<CashFlowClassificationInput> Items)
    : ICommand<IReadOnlyList<CashFlowClassificationDto>>;

/// <summary>Activity: Operating, Investing, Financing or NonCash; null removes the account's own tag.</summary>
public sealed record CashFlowClassificationInput(Guid AccountId, string? Activity);

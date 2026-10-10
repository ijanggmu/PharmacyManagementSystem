using FSH.Modules.Accounting.Contracts.Dtos;
using Mediator;

namespace FSH.Modules.Accounting.Contracts.v1.OpeningBalances;

/// <summary>The active opening balances for <paramref name="BranchId"/> (null = the caller's branch).</summary>
public sealed record GetOpeningBalancesQuery(Guid? BranchId = null) : IQuery<OpeningBalanceStateDto>;

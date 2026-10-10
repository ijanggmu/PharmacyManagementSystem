using FSH.Framework.Shared.Persistence;
using FSH.Modules.Accounting.Contracts.Dtos;
using Mediator;

namespace FSH.Modules.Accounting.Contracts.v1.OpeningBalances;

/// <summary>Opening-balance history, newest first. <paramref name="BranchId"/> null = the caller's
/// branch, or every branch for a caller who may view all branches.</summary>
public sealed record SearchOpeningBalanceHistoryQuery(Guid? BranchId = null, int PageNumber = 1, int PageSize = 20)
    : IQuery<PagedResponse<OpeningBalanceHistoryEntryDto>>;

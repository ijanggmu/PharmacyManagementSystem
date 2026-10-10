using FSH.Modules.Accounting.Contracts.Dtos;
using Mediator;

namespace FSH.Modules.Accounting.Contracts.v1.OpeningBalances;

/// <summary>
/// Posts the first opening-balance voucher for a branch (or the first one after a Reset).
/// <paramref name="RequestId"/> is a client-generated key: retrying with the same id returns the
/// original result instead of posting twice.
/// </summary>
public sealed record SetOpeningBalancesCommand(
    Guid RequestId,
    DateOnly OpeningDate,
    IReadOnlyList<OpeningBalanceLineInput> Lines,
    Guid? BranchId = null,
    string? Reason = null) : ICommand<OpeningBalanceMutationResultDto>;

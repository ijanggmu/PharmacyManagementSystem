using FSH.Modules.Accounting.Contracts.Dtos;
using Mediator;

namespace FSH.Modules.Accounting.Contracts.v1.OpeningBalances;

/// <summary>
/// Replaces the active opening balances: reverses the current opening voucher and posts a new one, in
/// one transaction. <paramref name="ExpectedVersion"/> is the <c>Version</c> the caller last read;
/// a mismatch means someone else changed them first.
/// </summary>
public sealed record EditOpeningBalancesCommand(
    Guid RequestId,
    int ExpectedVersion,
    DateOnly OpeningDate,
    IReadOnlyList<OpeningBalanceLineInput> Lines,
    string Reason,
    Guid? BranchId = null) : ICommand<OpeningBalanceMutationResultDto>;

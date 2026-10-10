using FSH.Modules.Accounting.Contracts.Dtos;
using Mediator;

namespace FSH.Modules.Accounting.Contracts.v1.OpeningBalances;

/// <summary>Reverses the active opening voucher and leaves none active, so the setup can start over.</summary>
public sealed record ResetOpeningBalancesCommand(
    Guid RequestId,
    int ExpectedVersion,
    string Reason,
    Guid? BranchId = null) : ICommand<OpeningBalanceMutationResultDto>;

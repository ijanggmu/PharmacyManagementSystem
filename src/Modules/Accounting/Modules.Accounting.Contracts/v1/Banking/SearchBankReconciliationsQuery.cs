using FSH.Framework.Shared.Persistence;
using FSH.Modules.Accounting.Contracts.Dtos;
using Mediator;

namespace FSH.Modules.Accounting.Contracts.v1.Banking;

public sealed record SearchBankReconciliationsQuery(
    Guid? BranchId = null,
    // One cash/bank account's reconciliations (Bank 1010 also lists the legacy rows that predate the account).
    Guid? AccountId = null,
    int PageNumber = 1,
    int PageSize = 50) : IQuery<PagedResponse<BankReconciliationDto>>;

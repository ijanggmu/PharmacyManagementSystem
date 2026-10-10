using FSH.Framework.Shared.Persistence;
using FSH.Modules.Accounting.Contracts.Dtos;
using Mediator;

namespace FSH.Modules.Accounting.Contracts.v1.Banking;

/// <summary>Lists bank statement imports, newest first. An omitted branch defaults to the caller's branch scope.</summary>
public sealed record SearchBankStatementImportsQuery(
    Guid? AccountId = null,
    Guid? BranchId = null,
    int PageNumber = 1,
    int PageSize = 50) : IQuery<PagedResponse<BankStatementImportSummaryDto>>;

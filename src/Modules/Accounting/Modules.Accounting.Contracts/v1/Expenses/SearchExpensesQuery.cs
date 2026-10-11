using FSH.Framework.Shared.Persistence;
using FSH.Modules.Accounting.Contracts.Dtos;
using Mediator;

namespace FSH.Modules.Accounting.Contracts.v1.Expenses;

public sealed record SearchExpensesQuery(
    string? Category = null,
    DateTime? DateFromUtc = null,
    DateTime? DateToUtc = null,
    Guid? BranchId = null,
    int PageNumber = 1,
    int PageSize = 50) : IQuery<PagedResponse<ExpenseDto>>;

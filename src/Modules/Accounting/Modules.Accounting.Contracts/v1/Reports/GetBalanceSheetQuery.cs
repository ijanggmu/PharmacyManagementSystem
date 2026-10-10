using FSH.Modules.Accounting.Contracts.Dtos;
using Mediator;

namespace FSH.Modules.Accounting.Contracts.v1.Reports;

public sealed record GetBalanceSheetQuery(DateTime AsOfUtc, Guid? BranchId = null) : IQuery<BalanceSheetDto>;

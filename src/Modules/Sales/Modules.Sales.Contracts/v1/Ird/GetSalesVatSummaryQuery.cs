using FSH.Modules.Sales.Contracts.Dtos;
using Mediator;

namespace FSH.Modules.Sales.Contracts.v1.Ird;

/// <summary>
/// Sales turnover and output VAT for the IRD VAT return, totalled from exactly the same documents and dates as
/// <see cref="GetIrdSalesRegisterQuery"/> (so the return's sales section always equals the register's totals):
/// invoices issued in [<paramref name="PeriodStartUtc"/>, <paramref name="PeriodEndUtc"/>], less cancellations,
/// completed returns and completed refunds (credit notes) recorded in the period. Branch-scoped the same way
/// (<c>ICurrentBranch.ResolveListBranchFilterAsync</c>). In-process; used by Accounting's VAT return.
/// </summary>
public sealed record GetSalesVatSummaryQuery(DateTime PeriodStartUtc, DateTime PeriodEndUtc, Guid? BranchId = null)
    : IQuery<SalesVatSummaryDto>;

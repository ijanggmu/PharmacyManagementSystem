using FSH.Modules.Accounting.Contracts.Dtos;
using Mediator;

namespace FSH.Modules.Accounting.Contracts.v1.Reports;

/// <summary>
/// The owner's at-a-glance figures for the home dashboard in one call: today's and month-to-date sales, the
/// month's gross margin from the GL, stock value, receivables, payables, cash and bank balances, VAT payable and
/// the top medicines by margin. <paramref name="BranchId"/> follows the usual report rule (Branches.ViewAll
/// callers pick a branch or all; everyone else gets their own). <paramref name="MonthStartUtc"/> is the start of
/// the month in UTC — the web app passes the Bikram Sambat month it shows; when omitted the Gregorian month
/// (Nepal time) is used. Briefly cached per tenant + branch scope.
/// </summary>
public sealed record GetOwnerDashboardQuery(Guid? BranchId = null, DateTime? MonthStartUtc = null)
    : IQuery<OwnerDashboardDto>;

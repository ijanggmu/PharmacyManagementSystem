using FSH.Modules.Accounting.Contracts.Dtos;
using Mediator;

namespace FSH.Modules.Accounting.Contracts.v1.Reports;

/// <summary>Trial balance for a period in one round trip: per account, the cumulative debit/credit before
/// <paramref name="FromUtc"/> (opening), the debit/credit inside [<paramref name="FromUtc"/>, <paramref name="ToUtc"/>]
/// (movement) and, separately, the part of that movement booked by opening-balance vouchers dated inside the
/// period — so a client can show them as movement or fold them into opening. <paramref name="BranchId"/> narrows
/// to one branch's vouchers (same branch rules as <see cref="GetTrialBalanceQuery"/>).</summary>
public sealed record GetPeriodTrialBalanceQuery(DateTime FromUtc, DateTime ToUtc, Guid? BranchId = null)
    : IQuery<PeriodTrialBalanceDto>;

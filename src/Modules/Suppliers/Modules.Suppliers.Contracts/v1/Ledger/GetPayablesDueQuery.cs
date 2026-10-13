using FSH.Modules.Suppliers.Contracts.Dtos;
using Mediator;

namespace FSH.Modules.Suppliers.Contracts.v1.Ledger;

/// <summary>
/// Payment scheduling: open supplier bills by due date as of <paramref name="AsOfUtc"/> — overdue, and due within
/// <paramref name="WithinDays"/> days (default a week) — with totals per supplier. Settlement is worked out exactly
/// as for the open-bills list and AP aging (across all branches, then filtered to <paramref name="BranchId"/>).
/// <paramref name="IncludeAll"/> also lists bills due later and bills without a due date (the daily alert scan uses
/// it to fall back to bill age for bills without terms).
/// </summary>
public sealed record GetPayablesDueQuery(
    DateTime AsOfUtc,
    int WithinDays = 7,
    Guid? BranchId = null,
    bool IncludeAll = false) : IQuery<PayablesDueDto>;

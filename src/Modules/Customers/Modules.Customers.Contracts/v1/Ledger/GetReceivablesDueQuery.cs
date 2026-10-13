using FSH.Modules.Customers.Contracts.Dtos;
using Mediator;

namespace FSH.Modules.Customers.Contracts.v1.Ledger;

/// <summary>
/// Open customer debts (sales on account and other debits still unpaid after FIFO settlement) by due date as of
/// <paramref name="AsOfUtc"/>: overdue, and due within <paramref name="WithinDays"/> days. <paramref name="CustomerId"/>
/// limits it to one customer (that customer's open invoices); <paramref name="IncludeAll"/> also lists debts due later
/// and debts without a due date (the daily alert scan uses it to fall back to age for customers without terms).
/// </summary>
public sealed record GetReceivablesDueQuery(
    DateTime AsOfUtc,
    int WithinDays = 7,
    Guid? BranchId = null,
    Guid? CustomerId = null,
    bool IncludeAll = false) : IQuery<ReceivablesDueDto>;

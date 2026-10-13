namespace FSH.Modules.Customers.Contracts.Dtos;

/// <summary>
/// One customer's outstanding balance, bucketed by how long each still-unsettled debit (sale on
/// account, opening balance, adjustment) has been open — settled FIFO against payments/credits in
/// chronological order, since individual payments aren't matched to a specific invoice in this
/// system (there's no invoice-allocation step). <c>Current</c> is 0-30 days old.
/// <para>The same debits by due date: <see cref="NotYetDue"/> (due today or later), <see cref="Overdue1To30"/> …
/// <see cref="OverdueOver90"/> (days past due), and <see cref="NoDueDate"/> for a customer without payment terms.
/// Both views add up to <see cref="Total"/>.</para>
/// </summary>
public sealed record ArAgingReportLineDto(
    Guid CustomerId,
    string CustomerName,
    decimal Current,
    decimal Days31To60,
    decimal Days61To90,
    decimal Over90,
    decimal Total,
    decimal NotYetDue = 0m,
    decimal Overdue1To30 = 0m,
    decimal Overdue31To60 = 0m,
    decimal Overdue61To90 = 0m,
    decimal OverdueOver90 = 0m,
    decimal NoDueDate = 0m);

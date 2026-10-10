namespace FSH.Modules.Customers.Contracts.Dtos;

/// <summary>
/// One customer's outstanding balance, bucketed by how long each still-unsettled debit (sale on
/// account, opening balance, adjustment) has been open — settled FIFO against payments/credits in
/// chronological order, since individual payments aren't matched to a specific invoice in this
/// system (there's no invoice-allocation step). <c>Current</c> is 0-30 days old.
/// </summary>
public sealed record ArAgingReportLineDto(
    Guid CustomerId,
    string CustomerName,
    decimal Current,
    decimal Days31To60,
    decimal Days61To90,
    decimal Over90,
    decimal Total);

using FSH.Framework.Eventing.Abstractions;
using FSH.Modules.Customers.Data;
using FSH.Modules.Customers.Services;
using FSH.Modules.Sales.Contracts.Events;

namespace FSH.Modules.Customers.IntegrationEventHandlers;

/// <summary>
/// A completed customer return's effect on the customer: the part of the money settled to the customer's
/// account (<see cref="ReturnCompletedIntegrationEvent.OnAccountAmount"/> — cancelling what a credit sale
/// still owed, or store credit) is credited to AR, and loyalty is reversed pro rata of what has been
/// returned/refunded of the sale so far. Idempotent: see <see cref="CustomerSaleReversalService"/>.
/// </summary>
public sealed class ReturnCompletedIntegrationEventHandler(CustomersDbContext dbContext)
    : IIntegrationEventHandler<ReturnCompletedIntegrationEvent>
{
    public async Task HandleAsync(ReturnCompletedIntegrationEvent @event, CancellationToken ct = default)
    {
        ArgumentNullException.ThrowIfNull(@event);

        if (@event.CustomerId is not { } customerId)
        {
            return;
        }

        await CustomerSaleReversalService.ApplyAsync(
            dbContext,
            new CustomerSaleReversal(
                Kind: "sale-return",
                ReferenceType: "SaleReturn",
                ReferenceId: @event.ReturnId,
                CustomerId: customerId,
                SaleId: @event.SaleId,
                BranchId: @event.BranchId,
                OnAccountCredit: Math.Max(0m, @event.OnAccountAmount),
                LoyaltyShare: CumulativeShare(@event.ReversedToDateAmount, @event.TotalReturnAmount, @event.SaleTotalAmount),
                Label: $"Return {DocumentLabel(@event.CreditNoteNumber, @event.ReturnId)}",
                DocumentNumber: string.IsNullOrWhiteSpace(@event.CreditNoteNumber) ? null : @event.CreditNoteNumber.Trim()),
            ct).ConfigureAwait(false);
    }

    /// <summary>The credit-note number the customer was given, else (older events without one) the short id.</summary>
    public static string DocumentLabel(string? creditNoteNumber, Guid id) =>
        string.IsNullOrWhiteSpace(creditNoteNumber) ? id.ToString()[..8].ToUpperInvariant() : creditNoteNumber.Trim();

    /// <summary>Share of the sale reversed so far (0 when the sale total is unknown — older events).</summary>
    internal static decimal CumulativeShare(decimal reversedToDate, decimal thisAmount, decimal saleTotal)
    {
        if (saleTotal <= 0m)
        {
            return 0m;
        }

        decimal reversed = reversedToDate > 0m ? reversedToDate : thisAmount;
        return Math.Min(1m, reversed / saleTotal);
    }
}

using FSH.Modules.Inventory.Contracts.v1.Transactions;
using FluentValidation;

namespace FSH.Modules.Inventory.Features.v1.Transactions.SearchInventoryTransactions;

public sealed class SearchInventoryTransactionsQueryValidator : AbstractValidator<SearchInventoryTransactionsQuery>
{
    public SearchInventoryTransactionsQueryValidator()
    {
        RuleFor(x => x.PageNumber).GreaterThanOrEqualTo(1);
        RuleFor(x => x.PageSize).InclusiveBetween(1, 200);
        RuleFor(x => x)
            .Must(x => x.DateFrom is null || x.DateTo is null || x.DateFrom <= x.DateTo)
            .WithMessage("dateFrom must be on or before dateTo.");
        When(x => !string.IsNullOrWhiteSpace(x.TransactionType), () =>
        {
            RuleFor(x => x.TransactionType)
                .Must(t => InventoryTransactionTypeFilter.TryParse(t, out _))
                .WithMessage("transactionType must be one of: Purchase, Sale, Adjustment, Transfer, Dispose (or expired), SaleReversal (or return), SupplierReturn (or supplier_return), Recall.");
        });
    }
}

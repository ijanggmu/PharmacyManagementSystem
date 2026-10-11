using FSH.Modules.Inventory.Contracts.v1.StockTransfers;
using FluentValidation;

namespace FSH.Modules.Inventory.Features.v1.StockTransfers.SearchStockTransfers;

public sealed class SearchStockTransfersQueryValidator : AbstractValidator<SearchStockTransfersQuery>
{
    public SearchStockTransfersQueryValidator()
    {
        RuleFor(x => x.PageNumber).GreaterThanOrEqualTo(1);
        RuleFor(x => x.PageSize).InclusiveBetween(1, 200);
        When(x => !string.IsNullOrWhiteSpace(x.Status), () =>
        {
            RuleFor(x => x.Status)
                .Must(s => StockTransferStatusFilter.TryParse(s, out _))
                .WithMessage("status must be one of: InTransit (in_transit), Completed, Cancelled.");
        });
    }
}

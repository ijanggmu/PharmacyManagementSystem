using FluentValidation;
using FSH.Modules.Inventory.Contracts.v1.Batches;

namespace FSH.Modules.Inventory.Features.v1.Batches.UpdateBatchSellingPrice;

public sealed class UpdateBatchSellingPriceCommandValidator : AbstractValidator<UpdateBatchSellingPriceCommand>
{
    public UpdateBatchSellingPriceCommandValidator()
    {
        RuleFor(x => x.BatchId).NotEmpty();
        // A lot without a price can't be sold, so a price must be above zero.
        RuleFor(x => x.SellingPrice).GreaterThan(0m).PrecisionScale(18, 2, ignoreTrailingZeros: true);
    }
}

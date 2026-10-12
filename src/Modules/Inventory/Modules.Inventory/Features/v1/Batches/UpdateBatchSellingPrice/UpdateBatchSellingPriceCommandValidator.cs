using FluentValidation;
using FSH.Modules.Inventory.Contracts.v1.Batches;

namespace FSH.Modules.Inventory.Features.v1.Batches.UpdateBatchSellingPrice;

public sealed class UpdateBatchSellingPriceCommandValidator : AbstractValidator<UpdateBatchSellingPriceCommand>
{
    public UpdateBatchSellingPriceCommandValidator()
    {
        RuleFor(x => x.BatchId).NotEmpty();
        RuleFor(x => x.SellingPrice).GreaterThan(0m);
    }
}

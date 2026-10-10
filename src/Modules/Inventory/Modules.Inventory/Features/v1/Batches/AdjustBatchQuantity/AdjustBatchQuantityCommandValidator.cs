using FluentValidation;
using FSH.Modules.Inventory.Contracts.v1.Batches;

namespace FSH.Modules.Inventory.Features.v1.Batches.AdjustBatchQuantity;

public sealed class AdjustBatchQuantityCommandValidator : AbstractValidator<AdjustBatchQuantityCommand>
{
    public AdjustBatchQuantityCommandValidator()
    {
        RuleFor(x => x.BatchId).NotEmpty();
        RuleFor(x => x.NewQuantity).GreaterThanOrEqualTo(0m);
        RuleFor(x => x.Reason).NotEmpty().MaximumLength(512);
    }
}

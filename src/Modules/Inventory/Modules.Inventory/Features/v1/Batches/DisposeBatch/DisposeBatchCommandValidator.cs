using FluentValidation;
using FSH.Modules.Inventory.Contracts.v1.Batches;

namespace FSH.Modules.Inventory.Features.v1.Batches.DisposeBatch;

public sealed class DisposeBatchCommandValidator : AbstractValidator<DisposeBatchCommand>
{
    public DisposeBatchCommandValidator()
    {
        RuleFor(x => x.BatchId).NotEmpty();
        RuleFor(x => x.Reason).NotEmpty().MaximumLength(512);
    }
}

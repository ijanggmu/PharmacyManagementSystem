using FluentValidation;
using FSH.Modules.Inventory.Contracts.v1.Batches;

namespace FSH.Modules.Inventory.Features.v1.Batches.DisposeBatch;

public sealed class DisposeBatchCommandValidator : AbstractValidator<DisposeBatchCommand>
{
    public DisposeBatchCommandValidator()
    {
        RuleFor(x => x.BatchId).NotEmpty();
        RuleFor(x => x.Reason).NotEmpty().MaximumLength(480);
        RuleFor(x => x.Category)
            .Must(c => WriteOffReasons.All.Contains(c!))
            .When(x => !string.IsNullOrWhiteSpace(x.Category))
            .WithMessage($"category must be one of: {string.Join(", ", WriteOffReasons.All)}.");
    }
}

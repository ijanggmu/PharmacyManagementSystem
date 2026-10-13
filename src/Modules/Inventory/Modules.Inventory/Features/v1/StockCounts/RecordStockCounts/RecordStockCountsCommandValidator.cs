using FluentValidation;
using FSH.Modules.Inventory.Contracts.v1.StockCounts;

namespace FSH.Modules.Inventory.Features.v1.StockCounts.RecordStockCounts;

public sealed class RecordStockCountsCommandValidator : AbstractValidator<RecordStockCountsCommand>
{
    public RecordStockCountsCommandValidator()
    {
        RuleFor(x => x.SessionId).NotEmpty();
        RuleFor(x => x.Entries).NotEmpty().Must(e => e is null || e.Count <= 500)
            .WithMessage("Send at most 500 counts at a time.");

        RuleForEach(x => x.Entries).ChildRules(entry =>
        {
            entry.RuleFor(e => e.CountedQuantity).GreaterThanOrEqualTo(0m).When(e => e.CountedQuantity is not null);
            entry.RuleFor(e => e.Note).MaximumLength(512);
            entry.RuleFor(e => e.BatchNo).MaximumLength(64);
            entry.RuleFor(e => e.RackLocation).MaximumLength(64);

            // A found lot (no line yet) needs its medicine, a lot to count against, and a figure.
            entry.When(e => e.LineId is null, () =>
            {
                entry.RuleFor(e => e.MedicineId).NotEmpty().WithMessage("A found lot needs its medicine.");
                entry.RuleFor(e => e.CountedQuantity).NotNull().WithMessage("A found lot needs its counted quantity.");
                entry.RuleFor(e => e)
                    .Must(e => e.BatchId is not null || !string.IsNullOrWhiteSpace(e.BatchNo))
                    .WithMessage("A found lot needs an existing batch or a batch number.");
            });
        });
    }
}

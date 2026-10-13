using FluentValidation;
using FSH.Modules.Inventory.Contracts.v1.Medicines;
using FSH.Modules.Inventory.Services;

namespace FSH.Modules.Inventory.Features.v1.Medicines.ImportOpeningStock;

/// <summary>The file as a whole; each row's fields are checked by <see cref="OpeningStockImportRowValidator"/> in the handler.</summary>
public sealed class ImportOpeningStockCommandValidator : AbstractValidator<ImportOpeningStockCommand>
{
    private static readonly TimeSpan NepalOffset = new(5, 45, 0);

    public ImportOpeningStockCommandValidator()
    {
        RuleFor(x => x.Rows).NotEmpty().WithMessage("The file has no stock rows.");
        RuleFor(x => x.Rows.Count).LessThanOrEqualTo(OpeningStockImportLimits.MaxRows)
            .When(x => x.Rows is not null)
            .WithName("Rows")
            .WithMessage($"At most {OpeningStockImportLimits.MaxRows} rows per file — split the list into several files.");
        RuleFor(x => x.Funding).MustBeKnownStockFunding();
        RuleFor(x => x.AsOfDate)
            .Must(d => d is null || (d >= new DateOnly(2000, 1, 1) && d <= DateOnly.FromDateTime(DateTime.UtcNow + NepalOffset)))
            .WithMessage("As-of date can't be in the future (or before 2000).");
    }
}

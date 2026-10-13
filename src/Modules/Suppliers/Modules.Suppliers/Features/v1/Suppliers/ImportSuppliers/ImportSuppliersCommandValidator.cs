using FluentValidation;
using FSH.Modules.Suppliers.Contracts.v1.Suppliers;

namespace FSH.Modules.Suppliers.Features.v1.Suppliers.ImportSuppliers;

/// <summary>The file as a whole; each row's fields are checked by <see cref="SupplierImportRowValidator"/> in the handler.</summary>
public sealed class ImportSuppliersCommandValidator : AbstractValidator<ImportSuppliersCommand>
{
    public ImportSuppliersCommandValidator()
    {
        RuleFor(x => x.Rows).NotEmpty().WithMessage("The file has no supplier rows.");
        RuleFor(x => x.Rows.Count).LessThanOrEqualTo(SupplierImportLimits.MaxRows)
            .When(x => x.Rows is not null)
            .WithName("Rows")
            .WithMessage($"At most {SupplierImportLimits.MaxRows} suppliers per file — split the list into several files.");
        RuleFor(x => x.DuplicateMode).Must(SupplierImportDuplicateModes.IsKnown)
            .WithMessage("Choose what to do with existing suppliers: skip or update.");
        RuleFor(x => x.AsOfDate)
            .Must(d => d is null || (d >= SupplierImportRowValidator.EarliestAsOfDate && d <= SupplierImportKeys.NepalToday()))
            .WithMessage("As-of date can't be in the future (or before 2000).");
    }
}

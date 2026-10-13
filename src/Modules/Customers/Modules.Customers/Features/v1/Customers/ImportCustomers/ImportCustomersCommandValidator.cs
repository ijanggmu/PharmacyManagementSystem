using FluentValidation;
using FSH.Modules.Customers.Contracts.v1.Customers;

namespace FSH.Modules.Customers.Features.v1.Customers.ImportCustomers;

/// <summary>
/// The file as a whole (row count, options). Each row's fields are checked by <see cref="CustomerImportRowValidator"/>
/// inside the handler, so a bad cell comes back as a row error rather than failing the request.
/// </summary>
public sealed class ImportCustomersCommandValidator : AbstractValidator<ImportCustomersCommand>
{
    public ImportCustomersCommandValidator()
    {
        RuleFor(x => x.Rows).NotEmpty().WithMessage("The file has no customer rows.");
        RuleFor(x => x.Rows.Count).LessThanOrEqualTo(CustomerImportLimits.MaxRows)
            .When(x => x.Rows is not null)
            .WithName("Rows")
            .WithMessage($"At most {CustomerImportLimits.MaxRows} customers per file — split the list into several files.");
        RuleFor(x => x.DuplicateMode).Must(CustomerImportDuplicateModes.IsKnown)
            .WithMessage("Choose what to do with existing customers: skip or update.");
        RuleFor(x => x.AsOfDate)
            .Must(d => d is null || (d >= CustomerImportRowValidator.EarliestAsOfDate && d <= CustomerImportKeys.NepalToday()))
            .WithMessage("As-of date can't be in the future (or before 2000).");
    }
}

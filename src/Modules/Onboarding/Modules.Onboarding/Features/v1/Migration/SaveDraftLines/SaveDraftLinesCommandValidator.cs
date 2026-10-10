using FluentValidation;
using FSH.Modules.Onboarding.Contracts.v1.Migration;
using FSH.Modules.Onboarding.Domain;

namespace FSH.Modules.Onboarding.Features.v1.Migration.SaveDraftLines;

/// <summary>
/// Shape validation only (rule.md/api-conventions.md §"Validation": cross-field/business rules live in
/// the handler+domain). The per-category "which fields are required" check is still shape-level (it
/// depends only on the request payload, not on any stored state), so it belongs here rather than in
/// <see cref="SaveDraftLinesCommandHandler"/>.
/// </summary>
public sealed class SaveDraftLinesCommandValidator : AbstractValidator<SaveDraftLinesCommand>
{
    public SaveDraftLinesCommandValidator()
    {
        RuleFor(x => x.SessionId).NotEmpty();

        RuleFor(x => x.Category)
            .NotEmpty()
            .Must(c => Enum.TryParse<MigrationCategory>(c, ignoreCase: true, out _))
            .WithMessage("Category must be one of Cash, Bank, Customer, Supplier, Stock.");

        RuleFor(x => x.Lines).NotEmpty().WithMessage("At least one line item is required.");

        RuleFor(x => x.Lines)
            .Must((command, lines) => AllLinesValidForCategory(command.Category, lines))
            .When(x => Enum.TryParse<MigrationCategory>(x.Category, ignoreCase: true, out _) && x.Lines.Count > 0)
            .WithMessage("One or more line items are missing required fields for this category.");
    }

    private static bool AllLinesValidForCategory(string categoryName, IReadOnlyList<DraftLineInput> lines)
    {
        var category = Enum.Parse<MigrationCategory>(categoryName, ignoreCase: true);

        return category switch
        {
            MigrationCategory.Cash or MigrationCategory.Bank => lines.All(l =>
                l.Amount is > 0 && l.PartyId is null && l.MedicineId is null),

            MigrationCategory.Customer or MigrationCategory.Supplier => lines.All(l =>
                l.PartyId is not null && l.PartyId != Guid.Empty && l.Amount is > 0),

            MigrationCategory.Stock => lines.All(l =>
                l.MedicineId is not null && l.MedicineId != Guid.Empty
                && l.Quantity is > 0
                && l.UnitCost is >= 0
                && l.ExpiryDate is not null),

            _ => false,
        };
    }
}

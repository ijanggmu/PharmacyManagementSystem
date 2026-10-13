using FluentValidation;
using FSH.Modules.Suppliers.Contracts.v1.Suppliers;
using FSH.Modules.Suppliers.Domain;

namespace FSH.Modules.Suppliers.Features.v1.Suppliers.ImportSuppliers;

/// <summary>
/// Per-row field rules of a supplier import — the limits of creating one supplier plus the PAN format and as-of date.
/// Run by the handler row by row; the property names are the template's column keys.
/// </summary>
public sealed class SupplierImportRowValidator : AbstractValidator<SupplierImportRow>
{
    public static readonly DateOnly EarliestAsOfDate = new(2000, 1, 1);

    public SupplierImportRowValidator()
        : this(SupplierImportKeys.NepalToday())
    {
    }

    public SupplierImportRowValidator(DateOnly today)
    {
        RuleFor(x => x.Name).NotEmpty().WithMessage("Enter the supplier's name.")
            .MaximumLength(256).OverridePropertyName("name");
        RuleFor(x => x.ContactPerson).MaximumLength(128).OverridePropertyName("contact_person");
        RuleFor(x => x.Phone).MaximumLength(32).OverridePropertyName("phone");
        RuleFor(x => x.Email).MaximumLength(256).EmailAddress().When(x => !string.IsNullOrWhiteSpace(x.Email))
            .WithMessage("Enter a valid email address.")
            .OverridePropertyName("email");
        RuleFor(x => x.Address).MaximumLength(512).OverridePropertyName("address");
        RuleFor(x => x.PanNumber)
            .Must(p => string.IsNullOrWhiteSpace(p) || SupplierImportKeys.IsValidPan(p))
            .WithMessage("PAN / VAT number must be 9 digits.")
            .OverridePropertyName("pan");
        RuleFor(x => x.CreditDays).InclusiveBetween(0, PaymentTerms.MaxCreditDays).When(x => x.CreditDays is not null)
            .WithMessage($"Credit days must be between 0 and {PaymentTerms.MaxCreditDays}.")
            .OverridePropertyName("credit_days");
        RuleFor(x => x.OpeningBalance)
            .InclusiveBetween(-SupplierImportLimits.MaxOpeningBalance, SupplierImportLimits.MaxOpeningBalance)
            .When(x => x.OpeningBalance is not null)
            .WithMessage("Opening balance must be between -1,00,00,000 and 1,00,00,000.")
            .PrecisionScale(18, 2, ignoreTrailingZeros: true).When(x => x.OpeningBalance is not null)
            .WithMessage("Opening balance can have at most 2 decimal places.")
            .OverridePropertyName("opening_balance");
        RuleFor(x => x.AsOfDate)
            .Must(d => d is null || (d >= EarliestAsOfDate && d <= today))
            .WithMessage("As-of date can't be in the future (or before 2000).")
            .OverridePropertyName("as_of_date");
    }
}

/// <summary>How rows are matched to suppliers: PAN by its canonical form, name like <c>SupplierNameGuard</c>.</summary>
public static class SupplierImportKeys
{
    private static readonly TimeSpan NepalOffset = new(5, 45, 0);

    public static DateOnly NepalToday() => DateOnly.FromDateTime(DateTime.UtcNow + NepalOffset);

    /// <summary>Trimmed, spaces removed, upper-cased; null when blank.</summary>
    public static string? PanKey(string? pan) =>
        string.IsNullOrWhiteSpace(pan)
            ? null
            : pan.Replace(" ", string.Empty, StringComparison.Ordinal).Trim().ToUpperInvariant();

    /// <summary>A Nepal PAN / VAT number is 9 digits.</summary>
    public static bool IsValidPan(string? pan) =>
        PanKey(pan) is { Length: 9 } key && key.All(char.IsAsciiDigit);

    /// <summary>Trimmed, upper-cased — the supplier name uniqueness key.</summary>
    public static string? NameKey(string? name) =>
        string.IsNullOrWhiteSpace(name) ? null : name.Trim().ToUpperInvariant();
}

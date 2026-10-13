using FluentValidation;
using FSH.Modules.Customers.Contracts.v1.Customers;
using FSH.Modules.Customers.Domain;
using FSH.Modules.Customers.Features.v1.Customers.CreateCustomer;

namespace FSH.Modules.Customers.Features.v1.Customers.ImportCustomers;

/// <summary>
/// The per-row field rules of a customer import — the same limits as creating one customer
/// (<see cref="CreateCustomerCommandValidator"/>) plus the import-only PAN and as-of date. Run by the handler,
/// row by row, so each failure is reported against its row and template column (the property names here are the
/// column keys) instead of failing the whole request with a 400.
/// </summary>
public sealed class CustomerImportRowValidator : AbstractValidator<CustomerImportRow>
{
    /// <summary>Opening balances can't be dated before this (a typo guard, and the GL's earliest fiscal years).</summary>
    public static readonly DateOnly EarliestAsOfDate = new(2000, 1, 1);

    public CustomerImportRowValidator()
        : this(CustomerImportKeys.NepalToday())
    {
    }

    public CustomerImportRowValidator(DateOnly today)
    {
        RuleFor(x => x.Name).NotEmpty().WithMessage("Enter the customer's name.")
            .MaximumLength(256).OverridePropertyName("name");
        RuleFor(x => x.Phone).MaximumLength(32)
            .Must(p => string.IsNullOrWhiteSpace(p) || CustomerImportKeys.PhoneKey(p) is not null)
            .WithMessage("Phone must have 7 to 15 digits.")
            .OverridePropertyName("phone");
        RuleFor(x => x.Email).MaximumLength(256).EmailAddress().When(x => !string.IsNullOrWhiteSpace(x.Email))
            .WithMessage("Enter a valid email address.")
            .OverridePropertyName("email");
        RuleFor(x => x.Address).MaximumLength(512).OverridePropertyName("address");
        RuleFor(x => x.PanNumber)
            .Must(p => string.IsNullOrWhiteSpace(p) || CustomerImportKeys.IsValidPan(p))
            .WithMessage("PAN / VAT number must be 9 digits.")
            .OverridePropertyName("pan");
        RuleFor(x => x.CreditLimit).GreaterThanOrEqualTo(0m).When(x => x.CreditLimit is not null)
            .WithMessage("Credit limit can't be negative.")
            .PrecisionScale(18, 2, ignoreTrailingZeros: true).When(x => x.CreditLimit is not null)
            .WithMessage("Credit limit can have at most 2 decimal places.")
            .OverridePropertyName("credit_limit");
        RuleFor(x => x.CreditDays).InclusiveBetween(0, PaymentTerms.MaxCreditDays).When(x => x.CreditDays is not null)
            .WithMessage($"Credit days must be between 0 and {PaymentTerms.MaxCreditDays}.")
            .OverridePropertyName("credit_days");
        RuleFor(x => x.OpeningBalance)
            .InclusiveBetween(-CreateCustomerCommandValidator.MaxOpeningBalance, CreateCustomerCommandValidator.MaxOpeningBalance)
            .When(x => x.OpeningBalance is not null)
            .WithMessage("Opening balance must be between -1,00,00,000 and 1,00,00,000.")
            .PrecisionScale(14, 2, ignoreTrailingZeros: true).When(x => x.OpeningBalance is not null)
            .WithMessage("Opening balance can have at most 2 decimal places.")
            .OverridePropertyName("opening_balance");
        RuleFor(x => x.AsOfDate)
            .Must(d => d is null || (d >= EarliestAsOfDate && d <= today))
            .WithMessage("As-of date can't be in the future (or before 2000).")
            .OverridePropertyName("as_of_date");
    }
}

/// <summary>How rows are matched to customers: phone by its digits, PAN by its canonical form.</summary>
public static class CustomerImportKeys
{
    private static readonly TimeSpan NepalOffset = new(5, 45, 0);

    public static DateOnly NepalToday() => DateOnly.FromDateTime(DateTime.UtcNow + NepalOffset);

    /// <summary>
    /// The phone's digits, without Nepal's +977 country code, so "+977-9841234567", "9841 234567" and
    /// "9841234567" are one number. Null when blank or not 7–15 digits.
    /// </summary>
    public static string? PhoneKey(string? phone)
    {
        if (string.IsNullOrWhiteSpace(phone))
        {
            return null;
        }

        string digits = new([.. phone.Where(char.IsAsciiDigit)]);
        if (digits.Length > 10 && digits.StartsWith("977", StringComparison.Ordinal))
        {
            digits = digits[3..];
        }

        return digits.Length is >= 7 and <= 15 ? digits : null;
    }

    /// <summary>Canonical PAN (see <see cref="Customer.NormalizePan"/>); null when blank.</summary>
    public static string? PanKey(string? pan) => Customer.NormalizePan(pan);

    /// <summary>A Nepal PAN / VAT number is 9 digits.</summary>
    public static bool IsValidPan(string? pan) =>
        PanKey(pan) is { Length: 9 } key && key.All(char.IsAsciiDigit);
}

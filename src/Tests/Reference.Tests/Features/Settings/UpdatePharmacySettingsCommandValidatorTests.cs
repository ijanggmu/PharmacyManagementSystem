using FSH.Modules.Reference.Contracts.v1.Settings;
using FSH.Modules.Reference.Features.v1.Settings.UpdatePharmacySettings;

namespace Reference.Tests.Features.Settings;

public sealed class UpdatePharmacySettingsCommandValidatorTests
{
    private static readonly UpdatePharmacySettingsCommandValidator Validator = new();

    private static UpdatePharmacySettingsCommand Command(decimal vatRatePercent) =>
        new("City Pharmacy", null, null, null, "NPR", vatRatePercent, "INV");

    [Theory]
    [InlineData("0")]
    [InlineData("13")]
    [InlineData("13.5")]
    [InlineData("13.25")]
    [InlineData("13.50")]
    [InlineData("100")]
    public void Accepts_rates_from_0_to_100_with_up_to_two_decimals(string rate)
    {
        var result = Validator.Validate(Command(decimal.Parse(rate, System.Globalization.CultureInfo.InvariantCulture)));
        result.IsValid.ShouldBeTrue();
    }

    [Theory]
    [InlineData("-0.01")]
    [InlineData("100.01")]
    [InlineData("13.125")]
    public void Rejects_out_of_range_or_over_precise_rates(string rate)
    {
        var result = Validator.Validate(Command(decimal.Parse(rate, System.Globalization.CultureInfo.InvariantCulture)));
        result.IsValid.ShouldBeFalse();
        result.Errors.ShouldContain(e => e.PropertyName == nameof(UpdatePharmacySettingsCommand.VatRatePercent));
    }

    [Theory]
    [InlineData("NPR")]
    [InlineData("npr")]
    [InlineData("USD")]
    public void Accepts_three_letter_currency_codes_in_any_case(string currency)
    {
        Validator.Validate(Command(13m) with { CurrencyCode = currency }).IsValid.ShouldBeTrue();
    }

    [Theory]
    [InlineData("NP")]
    [InlineData("NPRS")]
    [InlineData("N1R")]
    [InlineData("रु.")]
    public void Rejects_currency_codes_that_are_not_three_letters(string currency)
    {
        var result = Validator.Validate(Command(13m) with { CurrencyCode = currency });
        result.Errors.ShouldContain(e => e.PropertyName == nameof(UpdatePharmacySettingsCommand.CurrencyCode));
    }

    [Theory]
    [InlineData("INV")]
    [InlineData("KTM-01")]
    [InlineData("A")]
    [InlineData("ABCDEFGHIJ")]
    public void Accepts_invoice_prefixes_of_letters_digits_and_dashes(string prefix)
    {
        Validator.Validate(Command(13m) with { InvoiceNumberPrefix = prefix }).IsValid.ShouldBeTrue();
    }

    [Theory]
    [InlineData("ABCDEFGHIJK")]
    [InlineData("INV/")]
    [InlineData("IN V")]
    [InlineData("<b>")]
    public void Rejects_invoice_prefixes_with_other_characters_or_over_ten(string prefix)
    {
        var result = Validator.Validate(Command(13m) with { InvoiceNumberPrefix = prefix });
        result.Errors.ShouldContain(e => e.PropertyName == nameof(UpdatePharmacySettingsCommand.InvoiceNumberPrefix));
    }
}

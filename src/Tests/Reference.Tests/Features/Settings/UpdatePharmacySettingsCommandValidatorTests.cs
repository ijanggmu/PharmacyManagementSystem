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
}

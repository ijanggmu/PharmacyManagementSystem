using FSH.Modules.Reference.Contracts.v1.TenantSettings;
using FSH.Modules.Reference.Features.v1.TenantSettings.GetTenantSettings;

namespace Reference.Tests.Features.TenantSettings;

public sealed class TenantSettingCategoryTests
{
    [Theory]
    [InlineData("pharmacy.receipt_footer", "pharmacy")]
    [InlineData("pharmacy.backup.frequency", "pharmacy")]
    [InlineData("tax_rate", TenantSettingCategory.General)]
    [InlineData(".hidden", TenantSettingCategory.General)]
    public void Of_Should_Use_The_Key_Prefix_Before_The_First_Dot(string key, string expected)
    {
        TenantSettingCategory.Of(key).ShouldBe(expected);
    }

    [Fact]
    public void Matches_Should_Ignore_Case_And_Surrounding_Space()
    {
        TenantSettingCategory.Matches("pharmacy.receipt_footer", " Pharmacy ").ShouldBeTrue();
        TenantSettingCategory.Matches("tax_rate", "GENERAL").ShouldBeTrue();
        TenantSettingCategory.Matches("pharmacy.receipt_footer", "general").ShouldBeFalse();
        TenantSettingCategory.Matches("pharmacyx.key", "pharmacy").ShouldBeFalse();
    }

    [Fact]
    public void Validator_Should_Allow_No_Category_And_Reject_Dotted_Or_Blank_Ones()
    {
        var validator = new GetTenantSettingsQueryValidator();

        validator.Validate(new GetTenantSettingsQuery()).IsValid.ShouldBeTrue();
        validator.Validate(new GetTenantSettingsQuery("pharmacy")).IsValid.ShouldBeTrue();
        validator.Validate(new GetTenantSettingsQuery("pharmacy.receipt")).IsValid.ShouldBeFalse();
        validator.Validate(new GetTenantSettingsQuery("   ")).IsValid.ShouldBeFalse();
        validator.Validate(new GetTenantSettingsQuery(new string('a', 65))).IsValid.ShouldBeFalse();
    }
}

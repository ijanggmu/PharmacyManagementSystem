using FSH.Modules.Reference.Contracts.Controls;
using FSH.Modules.Reference.Contracts.v1.TenantSettings;
using FSH.Modules.Reference.Features.v1.TenantSettings.UpsertTenantSetting;

namespace Reference.Tests.Features.TenantSettings;

/// <summary>The internal-control keys only take values Sales and Accounting can read; other keys stay free-form.</summary>
public sealed class UpsertTenantSettingCommandValidatorTests
{
    private static readonly UpsertTenantSettingCommandValidator Validator = new();

    private static bool Valid(string key, string value) => Validator.Validate(new UpsertTenantSettingCommand(key, value)).IsValid;

    [Theory]
    [InlineData(InternalControlSettings.RequireOpenShiftKey, "true")]
    [InlineData(InternalControlSettings.RequireOpenShiftKey, "false")]
    [InlineData(InternalControlSettings.VoucherCreatorCannotPostKey, "True")]
    [InlineData(InternalControlSettings.RefundApprovalThresholdKey, "0")]
    [InlineData(InternalControlSettings.RefundApprovalThresholdKey, "2500.50")]
    [InlineData(InternalControlSettings.DiscountCapsKey, "{\"Cashier\":{\"line\":5,\"bill\":5},\"Manager\":{\"line\":null,\"bill\":null},\"*\":{\"line\":0}}")]
    [InlineData(InternalControlSettings.DiscountCapsKey, "{}")]
    [InlineData("pharmacy.footer_note", "anything goes")]
    public void Accepts_values_the_readers_understand(string key, string value)
    {
        Valid(key, value).ShouldBeTrue();
    }

    [Theory]
    [InlineData(InternalControlSettings.RequireOpenShiftKey, "yes")]
    [InlineData(InternalControlSettings.RequireOpenShiftKey, "1")]
    [InlineData(InternalControlSettings.VoucherCreatorCannotPostKey, "")]
    [InlineData(InternalControlSettings.RefundApprovalThresholdKey, "-1")]
    [InlineData(InternalControlSettings.RefundApprovalThresholdKey, "lots")]
    [InlineData(InternalControlSettings.DiscountCapsKey, "not json")]
    [InlineData(InternalControlSettings.DiscountCapsKey, "[1,2]")]
    [InlineData(InternalControlSettings.DiscountCapsKey, "{\"Cashier\":5}")]
    [InlineData(InternalControlSettings.DiscountCapsKey, "{\"Cashier\":{\"line\":150}}")]
    [InlineData(InternalControlSettings.DiscountCapsKey, "{\"Cashier\":{\"line\":-1}}")]
    [InlineData(InternalControlSettings.DiscountCapsKey, "{\"Cashier\":{\"line\":\"5\"}}")]
    [InlineData(InternalControlSettings.DiscountCapsKey, "{\"Cashier\":{\"max\":5}}")]
    public void Rejects_values_the_readers_would_silently_ignore(string key, string value)
    {
        Valid(key, value).ShouldBeFalse();
    }

    [Fact]
    public void Matches_control_keys_case_insensitively()
    {
        Valid("CONTROLS.REQUIRE_OPEN_SHIFT", "maybe").ShouldBeFalse();
    }
}

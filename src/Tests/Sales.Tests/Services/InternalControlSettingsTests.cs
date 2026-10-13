using FSH.Modules.Reference.Contracts.Controls;
using Shouldly;
using Xunit;

namespace Sales.Tests.Services;

public sealed class InternalControlSettingsTests
{
    [Fact]
    public void Defaults_Should_Be_Cashier5_Pharmacist10_ManagerUnlimited_Threshold1000_SodOff()
    {
        var settings = InternalControlSettings.From(null);

        settings.CapFor(["Cashier"]).ShouldBe(new DiscountCap(5m, 5m));
        settings.CapFor(["Pharmacist"]).ShouldBe(new DiscountCap(10m, 10m));
        settings.CapFor(["Manager"]).ShouldBe(DiscountCap.Unlimited);
        settings.CapFor(["Admin", "Cashier"]).ShouldBe(DiscountCap.Unlimited);
        settings.CapFor([]).ShouldBe(new DiscountCap(5m, 5m));
        settings.RefundApprovalThreshold.ShouldBe(1000m);
        settings.VoucherCreatorCannotPost.ShouldBeFalse();
    }

    [Fact]
    public void Stored_Caps_Should_Overlay_Defaults_Clamped_To_0_100()
    {
        var settings = InternalControlSettings.From(new Dictionary<string, string>
        {
            [InternalControlSettings.DiscountCapsKey] = """{"cashier":{"line":3,"bill":250},"Manager":{"line":20,"bill":null}}""",
            [InternalControlSettings.RefundApprovalThresholdKey] = "2500.50",
            [InternalControlSettings.VoucherCreatorCannotPostKey] = "TRUE",
        });

        settings.CapFor(["Cashier"]).ShouldBe(new DiscountCap(3m, 100m));
        settings.CapFor(["Manager"]).ShouldBe(new DiscountCap(20m, null));
        settings.CapFor(["Pharmacist"]).ShouldBe(new DiscountCap(10m, 10m)); // untouched default
        settings.RefundApprovalThreshold.ShouldBe(2500.50m);
        settings.VoucherCreatorCannotPost.ShouldBeTrue();
    }

    [Fact]
    public void Malformed_Values_Should_Fall_Back_To_Defaults()
    {
        var settings = InternalControlSettings.From(new Dictionary<string, string>
        {
            [InternalControlSettings.DiscountCapsKey] = "{not json",
            [InternalControlSettings.RefundApprovalThresholdKey] = "-5",
        });

        settings.CapFor(["Cashier"]).ShouldBe(new DiscountCap(5m, 5m));
        settings.RefundApprovalThreshold.ShouldBe(1000m);
    }

    [Fact]
    public void Serialized_Caps_Should_Round_Trip()
    {
        var caps = new Dictionary<string, DiscountCap> { ["Cashier"] = new(7m, 4m), ["*"] = new(1m, null) };

        var parsed = InternalControlSettings.ParseDiscountCaps(InternalControlSettings.SerializeDiscountCaps(caps));

        parsed["Cashier"].ShouldBe(new DiscountCap(7m, 4m));
        parsed["*"].ShouldBe(new DiscountCap(1m, null));
    }
}

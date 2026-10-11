using FSH.Modules.Reference.Contracts.Licenses;
using FSH.Modules.Reference.Contracts.v1.Licenses;
using FSH.Modules.Reference.Domain;
using FSH.Modules.Reference.Features.v1.Licenses.CreatePharmacyLicense;
using FSH.Modules.Reference.Jobs;

namespace Reference.Tests.Features.Licenses;

public sealed class PharmacyLicenseTests
{
    private static readonly DateOnly Today = new(2026, 10, 11);

    [Theory]
    [InlineData(61, PharmacyLicenseStatus.Valid)]
    [InlineData(60, PharmacyLicenseStatus.Expiring)]
    [InlineData(0, PharmacyLicenseStatus.Expiring)]
    [InlineData(-1, PharmacyLicenseStatus.Expired)]
    public void Status_Should_Follow_Days_Left(int daysLeft, string expected) =>
        PharmacyLicenseStatus.For(daysLeft).ShouldBe(expected);

    [Theory]
    [InlineData(60, true)]
    [InlineData(59, false)]
    [InlineData(30, true)]
    [InlineData(7, true)]
    [InlineData(1, true)]
    [InlineData(0, true)]
    [InlineData(-7, true)]
    [InlineData(-8, false)]
    [InlineData(-14, true)]
    public void Reminders_Go_Out_On_Set_Days_Then_Weekly_After_Expiry(int daysLeft, bool expected) =>
        LicenseExpiryScanJob.IsReminderDay(daysLeft).ShouldBe(expected);

    [Fact]
    public void DaysLeft_Should_Count_Calendar_Days()
    {
        var license = PharmacyLicense.Create(PharmacyLicenseTypes.DdaPharmacy, "DDA-123", Today.AddDays(30), null, null, null, null);
        license.DaysLeft(Today).ShouldBe(30);
    }

    [Fact]
    public void Renewing_Should_Restart_Reminders()
    {
        var license = PharmacyLicense.Create(PharmacyLicenseTypes.DdaPharmacy, "DDA-123", Today.AddDays(7), null, null, null, null);
        license.MarkReminded(Today);

        license.Update(PharmacyLicenseTypes.DdaPharmacy, "DDA-123", Today.AddDays(7), null, "Ram", null, null);
        license.LastReminderOn.ShouldBe(Today);

        license.Update(PharmacyLicenseTypes.DdaPharmacy, "DDA-123", Today.AddYears(1), null, "Ram", null, null);
        license.LastReminderOn.ShouldBeNull();
    }

    [Fact]
    public void Expiry_Before_Issue_Should_Be_Rejected() =>
        Should.Throw<ArgumentException>(() =>
            PharmacyLicense.Create(PharmacyLicenseTypes.PanVat, "PAN-1", Today, null, null, Today.AddDays(1), null));

    [Fact]
    public void Describe_Should_Use_The_Title_For_Other_Licenses()
    {
        PharmacyLicenseTypes.Describe(PharmacyLicenseTypes.Other, "Fire safety").ShouldBe("Fire safety");
        PharmacyLicenseTypes.Describe(PharmacyLicenseTypes.DdaPharmacy, "ignored").ShouldBe("DDA pharmacy license");
    }

    [Fact]
    public void Validator_Should_Require_A_Known_Type_A_Number_And_A_Title_For_Other()
    {
        var validator = new CreatePharmacyLicenseCommandValidator();

        validator.Validate(new CreatePharmacyLicenseCommand("dda_pharmacy", "DDA-1", Today)).IsValid.ShouldBeTrue();
        validator.Validate(new CreatePharmacyLicenseCommand("made_up", "X", Today)).IsValid.ShouldBeFalse();
        validator.Validate(new CreatePharmacyLicenseCommand("dda_pharmacy", " ", Today)).IsValid.ShouldBeFalse();
        validator.Validate(new CreatePharmacyLicenseCommand("other", "X", Today)).IsValid.ShouldBeFalse();
        validator.Validate(new CreatePharmacyLicenseCommand("dda_pharmacy", "DDA-1", Today, IssuedOn: Today.AddDays(1))).IsValid.ShouldBeFalse();
    }
}

using FSH.Modules.Reference.Domain;

namespace Reference.Tests.Domain;

public sealed class PharmacySettingsTests
{
    #region CreateDefault

    [Fact]
    public void CreateDefault_Should_SeedNepalCurrencyAndVatAndDefaultPrefix()
    {
        var settings = PharmacySettings.CreateDefault("My Pharmacy");

        settings.BusinessName.ShouldBe("My Pharmacy");
        settings.CurrencyCode.ShouldBe("NPR");
        settings.VatRatePercent.ShouldBe(13m);
        settings.InvoiceNumberPrefix.ShouldBe("INV");
        settings.NextInvoiceSequence.ShouldBe(1);
    }

    #endregion

    #region Update

    [Fact]
    public void Update_Should_UppercaseCurrencyCode_And_Restamp()
    {
        var settings = PharmacySettings.CreateDefault("My Pharmacy");

        settings.Update("New Name", "addr", "phone", "email", "usd", 15m, "NEW");

        settings.CurrencyCode.ShouldBe("USD");
        settings.VatRatePercent.ShouldBe(15m);
        settings.InvoiceNumberPrefix.ShouldBe("NEW");
        settings.UpdatedAtUtc.ShouldNotBeNull();
    }

    [Theory]
    [InlineData(-1)]
    [InlineData(101)]
    public void Update_Should_Throw_When_VatRateOutOfRange(decimal vatRate)
    {
        var settings = PharmacySettings.CreateDefault("My Pharmacy");

        Should.Throw<ArgumentOutOfRangeException>(() => settings.Update("My Pharmacy", null, null, null, "USD", vatRate, "INV"));
    }

    #endregion

    #region ReserveNextInvoiceNumber

    [Fact]
    public void ReserveNextInvoiceNumber_Should_IncrementSequence_And_FormatWithPrefix()
    {
        var settings = PharmacySettings.CreateDefault("My Pharmacy");

        var first = settings.ReserveNextInvoiceNumber();
        var second = settings.ReserveNextInvoiceNumber();

        first.ShouldBe("INV-000001");
        second.ShouldBe("INV-000002");
        settings.NextInvoiceSequence.ShouldBe(3);
    }

    #endregion
}

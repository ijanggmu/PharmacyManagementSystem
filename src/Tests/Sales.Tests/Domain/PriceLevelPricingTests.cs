using FSH.Framework.Core.Exceptions;
using FSH.Modules.Sales.Domain;
using FSH.Modules.Sales.Services;
using Shouldly;
using Xunit;

namespace Sales.Tests.Domain;

public sealed class PriceLevelPricingTests
{
    private static readonly Guid Paracetamol = Guid.CreateVersion7();
    private static readonly Guid Amoxicillin = Guid.CreateVersion7();

    private static PriceLevelPricing Level(decimal percent, params (Guid Id, decimal Price)[] explicitPrices) =>
        new(Guid.CreateVersion7(), "Wholesale", percent, explicitPrices.ToDictionary(p => p.Id, p => p.Price));

    [Theory]
    [InlineData(10, 11.30, 10.17)]
    [InlineData(12.5, 10.05, 8.79)] // 8.79375 → 8.79
    [InlineData(15, 2.35, 2.00)]    // 1.9975 → 2.00 (half away from zero)
    [InlineData(0, 7.77, 7.77)]
    public void Percent_Level_Prices_Each_Lot_Below_Its_Own_Price_Rounded_To_The_Paisa(decimal percent, decimal lot, decimal expected) =>
        Level(percent).PriceFor(Paracetamol, lot).ShouldBe(expected);

    [Fact]
    public void Explicit_Price_Wins_Over_The_Percent_For_That_Medicine_Only()
    {
        var level = Level(10m, (Paracetamol, 9.50m));
        level.PriceFor(Paracetamol, 11.30m).ShouldBe(9.50m);
        level.PriceFor(Amoxicillin, 20m).ShouldBe(18m);
    }

    [Fact]
    public void A_Level_Never_Prices_Above_The_Lot_Price()
    {
        // The lot price is the MRP: an explicit price above it is capped at it.
        Level(0m, (Paracetamol, 15m)).PriceFor(Paracetamol, 11.30m).ShouldBe(11.30m);
    }

    [Fact]
    public void An_Unpriced_Lot_Stays_Unpriced() => Level(10m).PriceFor(Paracetamol, 0m).ShouldBe(0m);

    [Fact]
    public void Resolution_Compares_The_Applied_Level_With_The_Customers_Own()
    {
        var own = Level(5m);
        var deeper = Level(10m);
        var resolution = new PriceLevelResolution(own, deeper);
        resolution.IsOverride.ShouldBeTrue();
        resolution.UnitPrice(Paracetamol, 20m).ShouldBe(18m);
        resolution.CustomerUnitPrice(Paracetamol, 20m).ShouldBe(19m);
        PriceLevelResolution.Retail.IsOverride.ShouldBeFalse();
        new PriceLevelResolution(own, own).IsOverride.ShouldBeFalse();
    }

    [Theory]
    [InlineData(-1)]
    [InlineData(100.01)]
    public void A_Level_Percent_Outside_0_To_100_Is_Refused(decimal percent) =>
        Should.Throw<CustomException>(() => PriceLevel.Create("Bad", percent, null));

    [Fact]
    public void An_Explicit_Level_Price_Must_Be_Positive() =>
        Should.Throw<CustomException>(() => PriceLevelItem.Create(Guid.CreateVersion7(), Paracetamol, 0m));
}

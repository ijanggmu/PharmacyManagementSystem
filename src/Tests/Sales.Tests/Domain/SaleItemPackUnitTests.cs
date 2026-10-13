using System.Net;
using FSH.Framework.Core.Exceptions;
using FSH.Modules.Sales.Domain;

namespace Sales.Tests.Domain;

public sealed class SaleItemPackUnitTests
{
    [Theory]
    [InlineData(10, "Strip", "Tablet", "strip", "tablet")]
    [InlineData(30, "Boxes", "Capsule", "box", "capsule")]
    [InlineData(15, "Tablet", "Tablet", "pack", "tablet")] // the label names the base unit
    [InlineData(5, null, "Syrup", "pack", "unit")]
    [InlineData(4, "  ", null, "pack", "unit")]
    public void ForMedicine_Should_Read_The_Unit_Label_As_The_Pack_Or_The_Base_Unit(
        int unitsPerPack, string? unitLabel, string? form, string packLabel, string baseLabel)
    {
        var unit = SaleItemPackUnit.ForMedicine(unitsPerPack, unitLabel, form);

        unit.ShouldNotBeNull();
        (unit.UnitsPerPack, unit.PackLabel, unit.BaseUnitLabel).ShouldBe((unitsPerPack, packLabel, baseLabel));
    }

    [Theory]
    [InlineData(null)]
    [InlineData(0)]
    public void ForMedicine_Should_Have_No_Pack_Without_A_Pack_Size(int? unitsPerPack) =>
        SaleItemPackUnit.ForMedicine(unitsPerPack, "Strip", "Tablet").ShouldBeNull();

    [Fact]
    public void EnsureConsistent_Should_Accept_Whole_Packs_In_Base_Units() =>
        Should.NotThrow(() => new SaleItemPackUnit(10, "strip", "tablet").EnsureConsistent(20m, 2m, "Paracetamol"));

    [Theory]
    [InlineData(15, 2)] // not the base quantity of two strips
    [InlineData(25, 2.5)] // half a strip
    [InlineData(0, 0)]
    public void EnsureConsistent_Should_Refuse_Anything_But_Whole_Packs(decimal baseQuantity, decimal packCount)
    {
        var ex = Should.Throw<CustomException>(
            () => new SaleItemPackUnit(10, "strip", "tablet").EnsureConsistent(baseQuantity, packCount, "Paracetamol"));

        ex.StatusCode.ShouldBe(HttpStatusCode.BadRequest);
    }

    [Fact]
    public void AddItem_Should_Snapshot_The_Pack_While_Quantity_Stays_In_Base_Units()
    {
        var sale = Sale.StartBuilding(Guid.CreateVersion7(), null, null, null);

        sale.AddItem(Guid.CreateVersion7(), 15m, 2m, 0m, 0m, 1m, packUnit: new SaleItemPackUnit(10, "strip", "tablet"));

        var line = sale.Items[0];
        (line.Quantity, line.SoldUnitsPerPack, line.SoldPackLabel, line.BaseUnitLabel).ShouldBe((15m, (int?)10, "strip", "tablet"));
        line.PackQuantity.ShouldBe(1.5m); // a pack sale split across lots: this lot's share
        line.LineTotal.ShouldBe(30m);
    }

    [Fact]
    public void AddItem_Without_A_Pack_Should_Leave_The_Unit_Fields_Empty()
    {
        var sale = Sale.StartBuilding(Guid.CreateVersion7(), null, null, null);

        sale.AddItem(Guid.CreateVersion7(), 3m, 10m, 0m, 0m, 4m);

        sale.Items[0].SoldUnitsPerPack.ShouldBeNull();
        sale.Items[0].PackQuantity.ShouldBeNull();
    }
}

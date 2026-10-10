using FSH.Framework.Core.Exceptions;
using FSH.Modules.Sales.Domain;

namespace Sales.Tests.Domain;

/// <summary>SaleItem's factory is internal — exercised indirectly through Sale.AddItem, which is the
/// only real entry point in production code too.</summary>
public sealed class SaleItemTests
{
    [Fact]
    public void AddItem_Should_ComputeLineTotal_NetOfDiscount()
    {
        var sale = Sale.StartBuilding(Guid.CreateVersion7(), null, null, null);

        sale.AddItem(Guid.CreateVersion7(), quantity: 3m, unitPrice: 10m, discountAmount: 5m, discountPercent: 0m, unitCostPrice: 4m);

        sale.Items[0].LineTotal.ShouldBe(25m);
    }

    [Fact]
    public void AddItem_Should_Throw_When_QuantityNotPositive()
    {
        var sale = Sale.StartBuilding(Guid.CreateVersion7(), null, null, null);

        Should.Throw<CustomException>(() => sale.AddItem(Guid.CreateVersion7(), 0m, 10m, 0m, 0m, 4m));
    }

    [Fact]
    public void AddItem_Should_Throw_When_DiscountExceedsGrossAmount()
    {
        var sale = Sale.StartBuilding(Guid.CreateVersion7(), null, null, null);

        Should.Throw<CustomException>(() => sale.AddItem(Guid.CreateVersion7(), 1m, 10m, 11m, 0m, 4m));
    }
}

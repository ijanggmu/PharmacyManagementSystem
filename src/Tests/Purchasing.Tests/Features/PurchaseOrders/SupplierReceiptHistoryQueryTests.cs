using FSH.Modules.Purchasing.Contracts.v1.PurchaseOrders;
using FSH.Modules.Purchasing.Data;
using FSH.Modules.Purchasing.Domain;
using FSH.Modules.Purchasing.Features.v1.PurchaseOrders.GetSupplierPurchaseHistory;
using FSH.Modules.Purchasing.Features.v1.PurchaseOrders.GetSupplierReceivedQuantity;

namespace Purchasing.Tests.Features.PurchaseOrders;

/// <summary>What was received from a supplier counts direct goods receipts as well as purchase orders —
/// return eligibility and cost history both read it.</summary>
public sealed class SupplierReceiptHistoryQueryTests : IDisposable
{
    private static readonly DateOnly Expiry = DateOnly.FromDateTime(DateTime.UtcNow.AddYears(1));
    private readonly PurchasingDbContext _db = PurchasingDbContextFactory.Create();
    private readonly Guid _supplier = Guid.CreateVersion7();
    private readonly Guid _medicine = Guid.CreateVersion7();

    private async Task SeedAsync()
    {
        var order = PurchaseOrder.CreateDraft(_supplier, DateTime.UtcNow.AddDays(-10), null, branchId: Guid.CreateVersion7());
        order.AddLine(_medicine, "A-1", Expiry, 10m, 5m, 8m, null);
        order.Approve("manager1");
        order.Receive("clerk1", DateTime.UtcNow.AddDays(-9));

        var direct = DirectGoodsReceipt.Create(_supplier, DateTime.UtcNow.AddDays(-2), "BILL-9", "clerk1", Guid.CreateVersion7());
        direct.AddLine(_medicine, 4m, 6m, 0m);

        var voided = DirectGoodsReceipt.Create(_supplier, DateTime.UtcNow.AddDays(-1), "BILL-10", "clerk1", Guid.CreateVersion7());
        voided.AddLine(_medicine, 100m, 7m, 0m);
        voided.Void("manager1", "wrong bill");

        _db.PurchaseOrders.Add(order);
        _db.DirectGoodsReceipts.AddRange(direct, voided);
        await _db.SaveChangesAsync();
    }

    [Fact]
    public async Task Received_Quantity_Should_Include_Non_Voided_Direct_Receipts()
    {
        await SeedAsync();

        decimal received = await new GetSupplierReceivedQuantityQueryHandler(_db)
            .Handle(new GetSupplierReceivedQuantityQuery(_supplier, _medicine), CancellationToken.None);

        received.ShouldBe(14m);
    }

    [Fact]
    public async Task Purchase_History_Should_Include_Direct_Receipts_Newest_First()
    {
        await SeedAsync();

        var history = await new GetSupplierPurchaseHistoryQueryHandler(_db)
            .Handle(new GetSupplierPurchaseHistoryQuery(_supplier), CancellationToken.None);

        history.Select(h => h.UnitCostPrice).ShouldBe([6m, 5m]);
    }

    public void Dispose() => _db.Dispose();
}

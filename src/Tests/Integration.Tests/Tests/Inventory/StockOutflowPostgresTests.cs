using Finbuckle.MultiTenant;
using Finbuckle.MultiTenant.Abstractions;
using FSH.Framework.Shared.Multitenancy;
using FSH.Modules.Inventory.Contracts.Services;
using FSH.Modules.Inventory.Data;
using FSH.Modules.Inventory.Domain;
using FSH.Modules.Multitenancy.Contracts;
using FSH.Modules.Purchasing.Contracts.v1.DirectGoodsReceipts;
using FSH.Modules.Purchasing.Data;
using FSH.Modules.Purchasing.Domain;
using FSH.Modules.Purchasing.Features.v1.DirectGoodsReceipts.VoidDirectGoodsReceipt;
using FSH.Modules.Suppliers.Contracts.v1.Returns;
using FSH.Modules.Suppliers.Data;
using FSH.Modules.Suppliers.Domain;
using FSH.Modules.Suppliers.Features.v1.Returns.CreateSupplierReturn;
using Integration.Tests.Infrastructure;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Shouldly;

namespace Integration.Tests.Tests.Inventory;

/// <summary>
/// Voiding a goods receipt and returning goods to a supplier, end to end on PostgreSQL: the stock leaves the
/// right batch, and the Inventory write commits inside the Purchasing / Suppliers transaction.
/// </summary>
[Collection(FshCollectionDefinition.Name)]
public sealed class StockOutflowPostgresTests
{
    private readonly FshWebApplicationFactory _factory;

    public StockOutflowPostgresTests(FshWebApplicationFactory factory)
    {
        _factory = factory;
    }

    [Fact]
    public async Task Voiding_A_Goods_Receipt_Should_Take_Back_Its_Own_Lot_Not_The_Oldest()
    {
        var branchId = Guid.CreateVersion7();
        using var scope = _factory.Services.CreateScope();
        var tenant = await scope.ServiceProvider.GetRequiredService<IMultiTenantStore<AppTenantInfo>>()
            .GetAsync(TestConstants.RootTenantId);
        // Installed inline: Finbuckle's tenant context is AsyncLocal, so a helper's set would be lost.
        scope.ServiceProvider.GetRequiredService<IMultiTenantContextSetter>()
            .MultiTenantContext = new MultiTenantContext<AppTenantInfo>(tenant!);
        var inventory = scope.ServiceProvider.GetRequiredService<InventoryDbContext>();
        var medicineId = await SeedMedicineAsync(inventory);
        var older = MedicineBatch.Create(medicineId, branchId, $"OLD-{Guid.CreateVersion7():N}"[..14],
            DateOnly.FromDateTime(DateTime.UtcNow.AddMonths(3)), 10m, 5m, 10m, null);
        inventory.MedicineBatches.Add(older);
        await inventory.SaveChangesAsync();

        var purchasing = scope.ServiceProvider.GetRequiredService<PurchasingDbContext>();
        var receipt = DirectGoodsReceipt.Create(Guid.CreateVersion7(), DateTime.UtcNow, null, "tester", branchId);
        receipt.AddLine(medicineId, 6m, 7m, 0m);
        purchasing.DirectGoodsReceipts.Add(receipt);
        await purchasing.SaveChangesAsync();
        var received = await scope.ServiceProvider.GetRequiredService<IStockReceiptService>().ReceiveAsync(new StockReceiptRequest(
            "DirectGoodsReceipt", receipt.Id,
            [new StockReceiptLine(medicineId, $"NEW-{Guid.CreateVersion7():N}"[..14], DateOnly.FromDateTime(DateTime.UtcNow.AddYears(2)), 6m, 7m, 14m)],
            branchId));

        var handler = ActivatorUtilities.CreateInstance<VoidDirectGoodsReceiptCommandHandler>(scope.ServiceProvider);
        await handler.Handle(new VoidDirectGoodsReceiptCommand(receipt.Id, "Wrong supplier"), CancellationToken.None);

        inventory.ChangeTracker.Clear();
        purchasing.ChangeTracker.Clear();
        (await inventory.MedicineBatches.AsNoTracking().SingleAsync(b => b.Id == received.Single().BatchId)).QuantityOnHand.ShouldBe(0m);
        (await inventory.MedicineBatches.AsNoTracking().SingleAsync(b => b.Id == older.Id)).QuantityOnHand.ShouldBe(10m);
        (await purchasing.DirectGoodsReceipts.AsNoTracking().SingleAsync(r => r.Id == receipt.Id)).Status
            .ShouldBe(DirectGoodsReceiptStatus.Voided);
    }

    [Fact]
    public async Task A_Supplier_Return_Of_A_Named_Lot_Should_Take_That_Lot_At_Its_Cost()
    {
        using var scope = _factory.Services.CreateScope();
        var tenant = await scope.ServiceProvider.GetRequiredService<IMultiTenantStore<AppTenantInfo>>()
            .GetAsync(TestConstants.RootTenantId);
        // Installed inline: Finbuckle's tenant context is AsyncLocal, so a helper's set would be lost.
        scope.ServiceProvider.GetRequiredService<IMultiTenantContextSetter>()
            .MultiTenantContext = new MultiTenantContext<AppTenantInfo>(tenant!);
        var branches = scope.ServiceProvider.GetRequiredService<IBranchService>();
        var branchId = await branches.GetDefaultBranchIdAsync()
            ?? (await branches.CreateAsync("Outflow Test Branch", $"OUT{Guid.CreateVersion7():N}"[..12])).Id;
        var inventory = scope.ServiceProvider.GetRequiredService<InventoryDbContext>();
        var medicineId = await SeedMedicineAsync(inventory);
        var soon = MedicineBatch.Create(medicineId, branchId, $"SOON-{Guid.CreateVersion7():N}"[..14],
            DateOnly.FromDateTime(DateTime.UtcNow.AddMonths(2)), 10m, 5m, 10m, null);
        var recalled = MedicineBatch.Create(medicineId, branchId, $"RCL-{Guid.CreateVersion7():N}"[..14],
            DateOnly.FromDateTime(DateTime.UtcNow.AddYears(1)), 10m, 8m, 16m, null);
        recalled.Recall("Supplier recall", DateTime.UtcNow);
        inventory.MedicineBatches.AddRange(soon, recalled);
        await inventory.SaveChangesAsync();

        var suppliers = scope.ServiceProvider.GetRequiredService<SuppliersDbContext>();
        var supplier = Supplier.Create($"Recall Supplier {Guid.CreateVersion7():N}"[..30], null, null, null, null, null, 0m);
        suppliers.Suppliers.Add(supplier);
        await suppliers.SaveChangesAsync();

        var handler = ActivatorUtilities.CreateInstance<CreateSupplierReturnCommandHandler>(scope.ServiceProvider);
        var returnId = await handler.Handle(new CreateSupplierReturnCommand(
            supplier.Id, DateTime.UtcNow, "Recall",
            [new SupplierReturnItemInput(medicineId, 4m, UnitCost: 999m, "Recalled", BatchId: recalled.Id)]), CancellationToken.None);

        inventory.ChangeTracker.Clear();
        suppliers.ChangeTracker.Clear();
        (await inventory.MedicineBatches.AsNoTracking().SingleAsync(b => b.Id == recalled.Id)).QuantityOnHand.ShouldBe(6m);
        (await inventory.MedicineBatches.AsNoTracking().SingleAsync(b => b.Id == soon.Id)).QuantityOnHand.ShouldBe(10m);
        (await suppliers.SupplierReturnItems.AsNoTracking().SingleAsync(i => i.SupplierReturnId == returnId)).UnitCost.ShouldBe(8m);
        (await suppliers.Suppliers.AsNoTracking().SingleAsync(s => s.Id == supplier.Id)).CurrentBalance.ShouldBe(-32m);
    }

    private static async Task<Guid> SeedMedicineAsync(InventoryDbContext db)
    {
        var medicine = Medicine.Create(
            name: $"Outflow {Guid.CreateVersion7():N}"[..20], genericName: null, categoryId: null,
            reorderLevel: 0m, unitPrice: 10m, costPrice: 5m);
        db.Medicines.Add(medicine);
        await db.SaveChangesAsync();
        return medicine.Id;
    }
}

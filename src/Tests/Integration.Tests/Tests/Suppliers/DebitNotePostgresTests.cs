using Finbuckle.MultiTenant;
using Finbuckle.MultiTenant.Abstractions;
using FSH.Framework.Shared.Multitenancy;
using FSH.Modules.Inventory.Contracts.Services;
using FSH.Modules.Inventory.Data;
using FSH.Modules.Inventory.Domain;
using FSH.Modules.Multitenancy.Contracts;
using FSH.Modules.Purchasing.Contracts.v1.DirectGoodsReceipts;
using FSH.Modules.Reference.Contracts.v1.Settings;
using FSH.Modules.Suppliers.Contracts.v1.Returns;
using FSH.Modules.Suppliers.Contracts.v1.Suppliers;
using FSH.Modules.Suppliers.Data;
using Integration.Tests.Infrastructure;
using Mediator;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Shouldly;

namespace Integration.Tests.Tests.Suppliers;

/// <summary>
/// A supplier return against real PostgreSQL: one transaction carries the debit note, its number, the
/// payable credit and the stock movement out of the named lot — and none of them survive a failure.
/// </summary>
[Collection(FshCollectionDefinition.Name)]
public sealed class DebitNotePostgresTests
{
    private readonly FshWebApplicationFactory _factory;

    public DebitNotePostgresTests(FshWebApplicationFactory factory)
    {
        _factory = factory;
    }

    [Fact]
    public async Task Return_Should_Number_The_Debit_Note_And_Move_Stock_Out_Of_The_Named_Lot()
    {
        using var scope = _factory.Services.CreateScope();
        var tenant = await scope.ServiceProvider.GetRequiredService<IMultiTenantStore<AppTenantInfo>>().GetAsync(TestConstants.RootTenantId);
        scope.ServiceProvider.GetRequiredService<IMultiTenantContextSetter>().MultiTenantContext = new MultiTenantContext<AppTenantInfo>(tenant!);
        var mediator = scope.ServiceProvider.GetRequiredService<IMediator>();
        _ = await scope.ServiceProvider.GetRequiredService<ICurrentBranch>().RequireBranchIdAsync();

        var inventory = scope.ServiceProvider.GetRequiredService<InventoryDbContext>();
        var medicine = Medicine.Create($"DN {Guid.CreateVersion7():N}"[..20], null, null, 0m, false, unitPrice: 20m, costPrice: 10m);
        inventory.Medicines.Add(medicine);
        await inventory.SaveChangesAsync();

        // Both lots come from this supplier: only goods received from a supplier can go back to them.
        var supplierId = await mediator.Send(new CreateSupplierCommand($"Supplier {Guid.CreateVersion7():N}"[..20]));
        string keepNo = $"K{Guid.CreateVersion7():N}"[..12];
        string damagedNo = $"D{Guid.CreateVersion7():N}"[..12];
        await ReceiveAsync(mediator, supplierId, medicine.Id, (keepNo, DateTime.UtcNow.AddMonths(1), 10m), (damagedNo, DateTime.UtcNow.AddYears(1), 10m));
        var keep = await LotAsync(inventory, medicine.Id, keepNo);
        var damaged = await LotAsync(inventory, medicine.Id, damagedNo);

        var returnId = await mediator.Send(new CreateSupplierReturnCommand(
            supplierId, DateTime.UtcNow, "Crushed in transit",
            [new SupplierReturnItemInput(medicine.Id, 4m, 10m, "Damaged", BatchId: damaged.Id)],
            SupplierInvoiceNumber: "BILL-9"));

        var dto = await mediator.Send(new GetSupplierReturnByIdQuery(returnId));
        dto.DocumentNumber.ShouldNotBeNull();
        dto.DocumentNumber.ShouldStartWith("DN-");
        dto.Items.Single().BatchId.ShouldBe(damaged.Id);
        // VAT follows the tenant's configured rate (the seeded default is 0%; other tests share this tenant).
        decimal vatRate = (await mediator.Send(new GetPharmacySettingsQuery())).VatRatePercent;
        decimal expectedVat = Math.Round(40m * vatRate / 100m, 2, MidpointRounding.AwayFromZero);
        dto.VatAmount.ShouldBe(expectedVat);
        dto.TotalAmount.ShouldBe(40m + expectedVat);

        var batches = await inventory.MedicineBatches.AsNoTracking().Where(b => b.MedicineId == medicine.Id).ToListAsync();
        batches.Single(b => b.Id == damaged.Id).QuantityOnHand.ShouldBe(6m);
        batches.Single(b => b.Id == keep.Id).QuantityOnHand.ShouldBe(10m);
    }

    [Fact]
    public async Task A_Return_Beyond_The_Named_Lot_Should_Leave_No_Debit_Note_Or_Stock_Movement()
    {
        using var scope = _factory.Services.CreateScope();
        var tenant = await scope.ServiceProvider.GetRequiredService<IMultiTenantStore<AppTenantInfo>>().GetAsync(TestConstants.RootTenantId);
        scope.ServiceProvider.GetRequiredService<IMultiTenantContextSetter>().MultiTenantContext = new MultiTenantContext<AppTenantInfo>(tenant!);
        var mediator = scope.ServiceProvider.GetRequiredService<IMediator>();
        _ = await scope.ServiceProvider.GetRequiredService<ICurrentBranch>().RequireBranchIdAsync();

        var inventory = scope.ServiceProvider.GetRequiredService<InventoryDbContext>();
        var medicine = Medicine.Create($"DN {Guid.CreateVersion7():N}"[..20], null, null, 0m, false, unitPrice: 20m, costPrice: 10m);
        inventory.Medicines.Add(medicine);
        await inventory.SaveChangesAsync();

        // 8 received from the supplier (so 5 is within what they delivered), but only 3 of them in the named lot.
        var supplierId = await mediator.Send(new CreateSupplierCommand($"Supplier {Guid.CreateVersion7():N}"[..20]));
        string lotNo = $"L{Guid.CreateVersion7():N}"[..12];
        await ReceiveAsync(mediator, supplierId, medicine.Id, (lotNo, DateTime.UtcNow.AddYears(1), 3m), ($"M{Guid.CreateVersion7():N}"[..12], DateTime.UtcNow.AddYears(1), 5m));
        var lot = await LotAsync(inventory, medicine.Id, lotNo);

        await Should.ThrowAsync<InsufficientStockException>(() => mediator.Send(new CreateSupplierReturnCommand(
            supplierId, DateTime.UtcNow, null, [new SupplierReturnItemInput(medicine.Id, 5m, 10m, "Damaged", BatchId: lot.Id)])).AsTask());

        var suppliers = scope.ServiceProvider.GetRequiredService<SuppliersDbContext>();
        (await suppliers.SupplierReturns.AsNoTracking().AnyAsync(r => r.SupplierId == supplierId)).ShouldBeFalse();
        (await suppliers.SupplierLedgerEntries.AsNoTracking().AnyAsync(e => e.SupplierId == supplierId && e.ReferenceType == "SupplierReturn")).ShouldBeFalse();
        (await inventory.MedicineBatches.AsNoTracking().SingleAsync(b => b.Id == lot.Id)).QuantityOnHand.ShouldBe(3m);
    }

    private static async Task ReceiveAsync(
        IMediator mediator, Guid supplierId, Guid medicineId, params (string BatchNo, DateTime Expiry, decimal Quantity)[] lots)
    {
        await mediator.Send(new CreateDirectGoodsReceiptCommand(
            supplierId, DateTime.UtcNow, $"BILL-{Guid.CreateVersion7():N}"[..16],
            lots.Select(l => new DirectGoodsReceiptLineInput(medicineId, l.BatchNo, DateOnly.FromDateTime(l.Expiry), l.Quantity, 10m)).ToList()));
    }

    private static Task<MedicineBatch> LotAsync(InventoryDbContext inventory, Guid medicineId, string batchNo) =>
        // Lots store the batch number normalised (trimmed, upper case).
        inventory.MedicineBatches.AsNoTracking().SingleAsync(b => b.MedicineId == medicineId && b.BatchNo == MedicineBatch.NormalizeBatchNo(batchNo));
}

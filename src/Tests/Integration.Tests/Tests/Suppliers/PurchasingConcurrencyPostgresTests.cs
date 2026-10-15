using System.Net;
using Finbuckle.MultiTenant;
using Finbuckle.MultiTenant.Abstractions;
using FSH.Framework.Core.Exceptions;
using FSH.Framework.Shared.Multitenancy;
using FSH.Modules.Inventory.Contracts.Services;
using FSH.Modules.Inventory.Data;
using FSH.Modules.Inventory.Domain;
using FSH.Modules.Inventory.Services;
using FSH.Modules.Multitenancy.Contracts;
using FSH.Modules.Purchasing.Contracts.v1.DirectGoodsReceipts;
using FSH.Modules.Purchasing.Contracts.v1.PurchaseOrders;
using FSH.Modules.Purchasing.Data;
using FSH.Modules.Purchasing.Domain;
using FSH.Modules.Purchasing.Features.v1.DirectGoodsReceipts.CreateDirectGoodsReceipt;
using FSH.Modules.Purchasing.Features.v1.DirectGoodsReceipts.VoidDirectGoodsReceipt;
using FSH.Modules.Purchasing.Features.v1.PurchaseOrders.ReceivePurchaseOrder;
using FSH.Modules.Suppliers.Contracts.Services;
using FSH.Modules.Suppliers.Contracts.v1.Ledger;
using FSH.Modules.Suppliers.Contracts.v1.Suppliers;
using FSH.Modules.Suppliers.Data;
using FSH.Modules.Suppliers.Domain;
using FSH.Modules.Suppliers.Features.v1.Ledger.RecordSupplierPayment;
using Integration.Tests.Infrastructure;
using Mediator;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Shouldly;

namespace Integration.Tests.Tests.Suppliers;

/// <summary>
/// Races concurrent writers on purchasing and the supplier AP account against real PostgreSQL to prove the
/// row locks hold: two payments against one bill, two postings to one supplier balance, two voids of one
/// direct goods receipt, and two receives of one purchase order. Each contender runs in its own DI scope (its
/// own DbContexts on its own shared connection), the way two HTTP requests would, released together through
/// a start gate.
/// </summary>
[Collection(FshCollectionDefinition.Name)]
public sealed class PurchasingConcurrencyPostgresTests
{
    private readonly FshWebApplicationFactory _factory;

    public PurchasingConcurrencyPostgresTests(FshWebApplicationFactory factory)
    {
        _factory = factory;
    }

    private enum Outcome
    {
        Succeeded,
        Rejected,
    }

    [Fact]
    public async Task Two_Payments_Against_One_Bill_Should_Not_Over_Pay_It()
    {
        var (supplierId, billId) = await SeedSupplierWithBillAsync(100m);
        var gate = new StartGate(parties: 2);

        var outcomes = await Task.WhenAll(
            PayBillAsync(supplierId, billId, 60m, gate),
            PayBillAsync(supplierId, billId, 60m, gate));

        outcomes.Count(o => o == Outcome.Succeeded).ShouldBe(1);
        outcomes.Count(o => o == Outcome.Rejected).ShouldBe(1);
        (await SupplierBalanceAsync(supplierId)).ShouldBe(40m);
    }

    [Fact]
    public async Task Concurrent_Postings_To_One_Supplier_Should_Not_Lose_A_Balance_Update()
    {
        var (supplierId, _) = await SeedSupplierWithBillAsync(0m);
        var gate = new StartGate(parties: 2);

        await Task.WhenAll(
            PostPurchaseAsync(supplierId, 10m, gate),
            PostPurchaseAsync(supplierId, 25m, gate));

        (await SupplierBalanceAsync(supplierId)).ShouldBe(35m);
        // The running balances on the entries form one chain (10 then 35, or 25 then 35).
        (await LastRunningBalanceAsync(supplierId)).ShouldBe(35m);
    }

    [Fact]
    public async Task Two_Voids_Of_One_Direct_Receipt_Should_Reverse_Its_Stock_Once_From_Its_Own_Lot()
    {
        var branchId = await TenantBranchIdAsync();
        var medicineId = await SeedMedicineAsync();
        var supplierId = await CreateSupplierAsync();
        // An older lot of the same medicine at the branch: a FEFO "sale-style" reversal would drain it first.
        var olderLotId = await SeedLotAsync(branchId, medicineId, 50m, DateOnly.FromDateTime(DateTime.UtcNow.AddMonths(2)));
        var receiptId = await CreateDirectReceiptAsync(branchId, supplierId, medicineId, quantity: 10m);
        var gate = new StartGate(parties: 2);

        var outcomes = await Task.WhenAll(
            VoidReceiptAsync(branchId, receiptId, gate),
            VoidReceiptAsync(branchId, receiptId, gate));

        outcomes.Count(o => o == Outcome.Succeeded).ShouldBe(1);
        outcomes.Count(o => o == Outcome.Rejected).ShouldBe(1);

        var (scope, tenant) = await NewScopeAsync();
        using var scopeHandle = scope;
        scope.ServiceProvider.GetRequiredService<IMultiTenantContextSetter>().MultiTenantContext = new MultiTenantContext<AppTenantInfo>(tenant);
        var inventory = scope.ServiceProvider.GetRequiredService<InventoryDbContext>();
        var purchasing = scope.ServiceProvider.GetRequiredService<PurchasingDbContext>();

        var line = (await purchasing.DirectGoodsReceipts.AsNoTracking().Include(r => r.Lines).SingleAsync(r => r.Id == receiptId)).Lines.Single();
        line.BatchId.ShouldNotBeNull();
        (await inventory.MedicineBatches.AsNoTracking().SingleAsync(b => b.Id == line.BatchId)).QuantityOnHand.ShouldBe(0m);
        (await inventory.MedicineBatches.AsNoTracking().SingleAsync(b => b.Id == olderLotId)).QuantityOnHand.ShouldBe(50m);
        var reversals = await inventory.InventoryTransactions.AsNoTracking()
            .Where(t => t.ReferenceId == receiptId && t.ReferenceType == "DirectGoodsReceiptVoid").ToListAsync();
        reversals.ShouldHaveSingleItem().Type.ShouldBe(InventoryTransactionType.PurchaseReversal);
    }

    [Fact]
    public async Task A_Void_After_The_Lot_Was_Partly_Sold_Should_Fail_And_Move_Nothing()
    {
        var branchId = await TenantBranchIdAsync();
        var medicineId = await SeedMedicineAsync();
        var supplierId = await CreateSupplierAsync();
        var receiptId = await CreateDirectReceiptAsync(branchId, supplierId, medicineId, quantity: 10m);
        await SellFromLotAsync(branchId, medicineId, 3m);

        var outcome = await VoidReceiptAsync(branchId, receiptId, new StartGate(parties: 1));

        outcome.ShouldBe(Outcome.Rejected);
        var (scope, tenant) = await NewScopeAsync();
        using var scopeHandle = scope;
        scope.ServiceProvider.GetRequiredService<IMultiTenantContextSetter>().MultiTenantContext = new MultiTenantContext<AppTenantInfo>(tenant);
        var purchasing = scope.ServiceProvider.GetRequiredService<PurchasingDbContext>();
        (await purchasing.DirectGoodsReceipts.AsNoTracking().SingleAsync(r => r.Id == receiptId)).Status.ShouldBe(DirectGoodsReceiptStatus.Received);
    }

    [Fact]
    public async Task Two_Receives_Of_One_Purchase_Order_Should_Add_Its_Stock_Once()
    {
        var branchId = await TenantBranchIdAsync();
        var medicineId = await SeedMedicineAsync();
        var supplierId = await CreateSupplierAsync();
        var orderId = await SeedApprovedOrderAsync(branchId, supplierId, medicineId, quantity: 12m);
        var gate = new StartGate(parties: 2);

        var outcomes = await Task.WhenAll(
            ReceiveOrderAsync(branchId, orderId, gate),
            ReceiveOrderAsync(branchId, orderId, gate));

        outcomes.Count(o => o == Outcome.Succeeded).ShouldBe(1);
        outcomes.Count(o => o == Outcome.Rejected).ShouldBe(1);

        var (scope, tenant) = await NewScopeAsync();
        using var scopeHandle = scope;
        scope.ServiceProvider.GetRequiredService<IMultiTenantContextSetter>().MultiTenantContext = new MultiTenantContext<AppTenantInfo>(tenant);
        var inventory = scope.ServiceProvider.GetRequiredService<InventoryDbContext>();
        (await inventory.MedicineBatches.AsNoTracking().Where(b => b.MedicineId == medicineId).SumAsync(b => b.QuantityOnHand)).ShouldBe(12m);
    }

    // ---------------------------------------------------------------------------------------------
    // Contenders. Each opens its own scope and installs the tenant INLINE (Finbuckle's context is AsyncLocal).
    // ---------------------------------------------------------------------------------------------

    private async Task<Outcome> PayBillAsync(Guid supplierId, Guid billId, decimal amount, StartGate gate)
    {
        var (scope, tenant) = await NewScopeAsync();
        using var scopeHandle = scope;
        scope.ServiceProvider.GetRequiredService<IMultiTenantContextSetter>().MultiTenantContext = new MultiTenantContext<AppTenantInfo>(tenant);

        // A real branch: the payment number carries its code (PAY-<branch>-...).
        var handler = ActivatorUtilities.CreateInstance<RecordSupplierPaymentCommandHandler>(scope.ServiceProvider, new FixedBranch(await TenantBranchIdAsync()));
        await gate.ArriveAsync();
        try
        {
            await handler.Handle(
                new RecordSupplierPaymentCommand(supplierId, amount, DateTime.UtcNow, "race", "cash", "DirectGoodsReceipt", billId),
                CancellationToken.None);
            return Outcome.Succeeded;
        }
        catch (CustomException ex) when (ex.StatusCode == HttpStatusCode.Conflict)
        {
            return Outcome.Rejected;
        }
    }

    private async Task PostPurchaseAsync(Guid supplierId, decimal amount, StartGate gate)
    {
        var (scope, tenant) = await NewScopeAsync();
        using var scopeHandle = scope;
        scope.ServiceProvider.GetRequiredService<IMultiTenantContextSetter>().MultiTenantContext = new MultiTenantContext<AppTenantInfo>(tenant);

        var ledger = scope.ServiceProvider.GetRequiredService<ISupplierLedgerService>();
        await gate.ArriveAsync();
        await ledger.RecordPurchaseAsync(supplierId, amount, DateTime.UtcNow, "race", "Race", Guid.CreateVersion7(), Guid.CreateVersion7());
    }

    private async Task<Outcome> VoidReceiptAsync(Guid branchId, Guid receiptId, StartGate gate)
    {
        var (scope, tenant) = await NewScopeAsync();
        using var scopeHandle = scope;
        scope.ServiceProvider.GetRequiredService<IMultiTenantContextSetter>().MultiTenantContext = new MultiTenantContext<AppTenantInfo>(tenant);

        var branch = new FixedBranch(branchId);
        IStockReceiptService stock = new StockReceiptService(scope.ServiceProvider.GetRequiredService<InventoryDbContext>(), branch);
        var handler = ActivatorUtilities.CreateInstance<VoidDirectGoodsReceiptCommandHandler>(scope.ServiceProvider, stock, branch);
        await gate.ArriveAsync();
        try
        {
            await handler.Handle(new VoidDirectGoodsReceiptCommand(receiptId, "race"), CancellationToken.None);
            return Outcome.Succeeded;
        }
        catch (CustomException ex) when (ex.StatusCode == HttpStatusCode.Conflict)
        {
            return Outcome.Rejected;
        }
    }

    private async Task<Outcome> ReceiveOrderAsync(Guid branchId, Guid orderId, StartGate gate)
    {
        var (scope, tenant) = await NewScopeAsync();
        using var scopeHandle = scope;
        scope.ServiceProvider.GetRequiredService<IMultiTenantContextSetter>().MultiTenantContext = new MultiTenantContext<AppTenantInfo>(tenant);

        var branch = new FixedBranch(branchId);
        IStockReceiptService stock = new StockReceiptService(scope.ServiceProvider.GetRequiredService<InventoryDbContext>(), branch);
        var handler = ActivatorUtilities.CreateInstance<ReceivePurchaseOrderCommandHandler>(scope.ServiceProvider, stock, branch);
        await gate.ArriveAsync();
        try
        {
            await handler.Handle(new ReceivePurchaseOrderCommand(orderId), CancellationToken.None);
            return Outcome.Succeeded;
        }
        catch (CustomException ex) when (ex.StatusCode == HttpStatusCode.Conflict)
        {
            return Outcome.Rejected;
        }
    }

    // ---------------------------------------------------------------------------------------------
    // Seeding and verification.
    // ---------------------------------------------------------------------------------------------

    private async Task<(Guid SupplierId, Guid BillId)> SeedSupplierWithBillAsync(decimal billAmount)
    {
        var (scope, tenant) = await NewScopeAsync();
        using var scopeHandle = scope;
        scope.ServiceProvider.GetRequiredService<IMultiTenantContextSetter>().MultiTenantContext = new MultiTenantContext<AppTenantInfo>(tenant);

        var db = scope.ServiceProvider.GetRequiredService<SuppliersDbContext>();
        var supplier = Supplier.Create($"Race {Guid.CreateVersion7():N}"[..20], null, null, null, null, null, 0m);
        db.Suppliers.Add(supplier);
        var billId = Guid.CreateVersion7();
        if (billAmount > 0)
        {
            decimal running = supplier.ApplyLedgerEntry(billAmount, 0m);
            db.SupplierLedgerEntries.Add(SupplierLedgerEntry.Create(
                supplier.Id, DateTime.UtcNow.AddDays(-1), SupplierLedgerEntryType.Purchase, "bill", billAmount, 0m, running,
                "DirectGoodsReceipt", billId));
        }

        await db.SaveChangesAsync();
        return (supplier.Id, billId);
    }

    private async Task<Guid> CreateSupplierAsync()
    {
        var (scope, tenant) = await NewScopeAsync();
        using var scopeHandle = scope;
        scope.ServiceProvider.GetRequiredService<IMultiTenantContextSetter>().MultiTenantContext = new MultiTenantContext<AppTenantInfo>(tenant);
        return await scope.ServiceProvider.GetRequiredService<IMediator>()
            .Send(new CreateSupplierCommand($"Supplier {Guid.CreateVersion7():N}"[..20]));
    }

    private async Task<Guid> SeedMedicineAsync()
    {
        var (scope, tenant) = await NewScopeAsync();
        using var scopeHandle = scope;
        scope.ServiceProvider.GetRequiredService<IMultiTenantContextSetter>().MultiTenantContext = new MultiTenantContext<AppTenantInfo>(tenant);

        var db = scope.ServiceProvider.GetRequiredService<InventoryDbContext>();
        var medicine = Medicine.Create($"Pur {Guid.CreateVersion7():N}"[..20], null, null, 0m, false, unitPrice: 20m, costPrice: 10m);
        db.Medicines.Add(medicine);
        await db.SaveChangesAsync();
        return medicine.Id;
    }

    private async Task<Guid> SeedLotAsync(Guid branchId, Guid medicineId, decimal quantity, DateOnly expiry)
    {
        var (scope, tenant) = await NewScopeAsync();
        using var scopeHandle = scope;
        scope.ServiceProvider.GetRequiredService<IMultiTenantContextSetter>().MultiTenantContext = new MultiTenantContext<AppTenantInfo>(tenant);

        var db = scope.ServiceProvider.GetRequiredService<InventoryDbContext>();
        var lot = MedicineBatch.Create(medicineId, branchId, $"OLD{Guid.CreateVersion7():N}"[..12], expiry, quantity, 10m, 20m, null);
        db.MedicineBatches.Add(lot);
        await db.SaveChangesAsync();
        return lot.Id;
    }

    private async Task<Guid> CreateDirectReceiptAsync(Guid branchId, Guid supplierId, Guid medicineId, decimal quantity)
    {
        var (scope, tenant) = await NewScopeAsync();
        using var scopeHandle = scope;
        scope.ServiceProvider.GetRequiredService<IMultiTenantContextSetter>().MultiTenantContext = new MultiTenantContext<AppTenantInfo>(tenant);

        var branch = new FixedBranch(branchId);
        IStockReceiptService stock = new StockReceiptService(scope.ServiceProvider.GetRequiredService<InventoryDbContext>(), branch);
        var handler = ActivatorUtilities.CreateInstance<CreateDirectGoodsReceiptCommandHandler>(scope.ServiceProvider, stock, branch);
        return await handler.Handle(
            new CreateDirectGoodsReceiptCommand(
                supplierId, DateTime.UtcNow, "BILL-RACE",
                [new DirectGoodsReceiptLineInput(medicineId, $"NEW{Guid.CreateVersion7():N}"[..12], DateOnly.FromDateTime(DateTime.UtcNow.AddYears(1)), quantity, 10m)]),
            CancellationToken.None);
    }

    private async Task SellFromLotAsync(Guid branchId, Guid medicineId, decimal quantity)
    {
        var (scope, tenant) = await NewScopeAsync();
        using var scopeHandle = scope;
        scope.ServiceProvider.GetRequiredService<IMultiTenantContextSetter>().MultiTenantContext = new MultiTenantContext<AppTenantInfo>(tenant);

        var db = scope.ServiceProvider.GetRequiredService<InventoryDbContext>();
        await using var transaction = await db.Database.BeginTransactionAsync();
        await new StockDeductionService(db, new FixedBranch(branchId)).DeductForSaleAsync(
            new StockDeductionRequest("Sale", Guid.CreateVersion7(), [new StockDeductionLine(medicineId, quantity)]));
        await transaction.CommitAsync();
    }

    private async Task<Guid> SeedApprovedOrderAsync(Guid branchId, Guid supplierId, Guid medicineId, decimal quantity)
    {
        var (scope, tenant) = await NewScopeAsync();
        using var scopeHandle = scope;
        scope.ServiceProvider.GetRequiredService<IMultiTenantContextSetter>().MultiTenantContext = new MultiTenantContext<AppTenantInfo>(tenant);

        var db = scope.ServiceProvider.GetRequiredService<PurchasingDbContext>();
        var order = PurchaseOrder.CreateDraft(supplierId, DateTime.UtcNow, "race", branchId: branchId);
        order.AddLine(medicineId, $"PO{Guid.CreateVersion7():N}"[..12], DateOnly.FromDateTime(DateTime.UtcNow.AddYears(1)), quantity, 10m, 20m, null);
        order.Approve("manager");
        db.PurchaseOrders.Add(order);
        await db.SaveChangesAsync();
        return order.Id;
    }

    private async Task<decimal> SupplierBalanceAsync(Guid supplierId)
    {
        var (scope, tenant) = await NewScopeAsync();
        using var scopeHandle = scope;
        scope.ServiceProvider.GetRequiredService<IMultiTenantContextSetter>().MultiTenantContext = new MultiTenantContext<AppTenantInfo>(tenant);

        var db = scope.ServiceProvider.GetRequiredService<SuppliersDbContext>();
        return (await db.Suppliers.AsNoTracking().SingleAsync(s => s.Id == supplierId)).CurrentBalance;
    }

    private async Task<decimal> LastRunningBalanceAsync(Guid supplierId)
    {
        var (scope, tenant) = await NewScopeAsync();
        using var scopeHandle = scope;
        scope.ServiceProvider.GetRequiredService<IMultiTenantContextSetter>().MultiTenantContext = new MultiTenantContext<AppTenantInfo>(tenant);

        var db = scope.ServiceProvider.GetRequiredService<SuppliersDbContext>();
        return await db.SupplierLedgerEntries.AsNoTracking()
            .Where(e => e.SupplierId == supplierId)
            .OrderByDescending(e => e.RunningBalance)
            .Select(e => e.RunningBalance)
            .FirstAsync();
    }

    private async Task<Guid> TenantBranchIdAsync()
    {
        var (scope, tenant) = await NewScopeAsync();
        using var scopeHandle = scope;
        scope.ServiceProvider.GetRequiredService<IMultiTenantContextSetter>().MultiTenantContext = new MultiTenantContext<AppTenantInfo>(tenant);

        var branches = scope.ServiceProvider.GetRequiredService<IBranchService>();
        if (await branches.GetDefaultBranchIdAsync() is { } defaultBranchId)
        {
            return defaultBranchId;
        }

        var created = await branches.CreateAsync("Purchasing Race Branch", $"PRC{Guid.CreateVersion7():N}"[..12]);
        return created.Id;
    }

    private async Task<(IServiceScope Scope, AppTenantInfo Tenant)> NewScopeAsync()
    {
        var scope = _factory.Services.CreateScope();
        var tenant = await scope.ServiceProvider
            .GetRequiredService<IMultiTenantStore<AppTenantInfo>>()
            .GetAsync(TestConstants.RootTenantId);
        return (scope, tenant!);
    }

    private sealed class StartGate(int parties)
    {
        private int _arrived;
        private readonly TaskCompletionSource _open = new(TaskCreationOptions.RunContinuationsAsynchronously);

        public Task ArriveAsync()
        {
            if (Interlocked.Increment(ref _arrived) >= parties)
            {
                _open.TrySetResult();
            }

            return _open.Task;
        }
    }

    private sealed class FixedBranch(Guid branchId) : ICurrentBranch
    {
        public Task<Guid?> GetBranchIdAsync(CancellationToken cancellationToken = default) => Task.FromResult<Guid?>(branchId);

        public Task<Guid?> GetListFilterBranchIdAsync(CancellationToken cancellationToken = default) => Task.FromResult<Guid?>(branchId);

        public Task<Guid?> ResolveListBranchFilterAsync(Guid? requestedBranchId, CancellationToken cancellationToken = default) =>
            Task.FromResult<Guid?>(requestedBranchId ?? branchId);

        public Task<bool> CanViewAllBranchesAsync(CancellationToken cancellationToken = default) => Task.FromResult(false);

        public Task<Guid> RequireBranchIdAsync(CancellationToken cancellationToken = default) => Task.FromResult(branchId);
    }
}

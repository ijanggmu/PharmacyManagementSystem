using Finbuckle.MultiTenant;
using Finbuckle.MultiTenant.Abstractions;
using FSH.Framework.Core.Exceptions;
using FSH.Framework.Shared.Multitenancy;
using FSH.Modules.Inventory.Contracts.Services;
using FSH.Modules.Inventory.Data;
using FSH.Modules.Inventory.Domain;
using FSH.Modules.Inventory.Services;
using FSH.Modules.Multitenancy.Contracts;
using FSH.Modules.Sales.Contracts.v1.CashShifts;
using FSH.Modules.Sales.Contracts.v1.Sales;
using FSH.Modules.Sales.Data;
using FSH.Modules.Sales.Domain;
using FSH.Modules.Sales.Features.v1.CashShifts.StartCashShift;
using FSH.Modules.Sales.Features.v1.Sales.CreateSale;
using FSH.Modules.Sales.Jobs;
using Integration.Tests.Infrastructure;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Shouldly;

namespace Integration.Tests.Tests.Sales;

/// <summary>
/// Real-PostgreSQL checks for the checkout idempotency key (unique per tenant, replay returns the recorded sale
/// even while the original is in flight), the one-open-cash-shift-per-branch index, and the IRD queue job
/// running under each row's tenant context.
/// </summary>
[Collection(FshCollectionDefinition.Name)]
public sealed class SalesHardeningPostgresTests
{
    private readonly FshWebApplicationFactory _factory;

    public SalesHardeningPostgresTests(FshWebApplicationFactory factory)
    {
        _factory = factory;
    }

    [Fact]
    public async Task Concurrent_Checkouts_With_The_Same_Key_Should_Record_One_Sale()
    {
        // One unit on hand: the in-flight replay loses on stock, yet must still answer with the recorded sale.
        var branchId = await TenantBranchIdAsync();
        var medicineId = await SeedMedicineWithBatchAsync(branchId, quantityOnHand: 1m);
        string key = $"checkout-{Guid.CreateVersion7():N}";
        var gate = new StartGate(parties: 2);

        var ids = await Task.WhenAll(
            SellOneUnitAsync(branchId, medicineId, key, gate),
            SellOneUnitAsync(branchId, medicineId, key, gate));

        ids[0].ShouldBe(ids[1]);
        (await CountSalesAsync(medicineId)).ShouldBe(1);
    }

    [Fact]
    public async Task Concurrent_Checkouts_With_The_Same_Key_And_Enough_Stock_Should_Still_Record_One_Sale()
    {
        // Enough stock for both: the loser reaches the insert and hits the unique (TenantId, ClientRequestId) index.
        var branchId = await TenantBranchIdAsync();
        var medicineId = await SeedMedicineWithBatchAsync(branchId, quantityOnHand: 5m);
        string key = $"checkout-{Guid.CreateVersion7():N}";
        var gate = new StartGate(parties: 2);

        var ids = await Task.WhenAll(
            SellOneUnitAsync(branchId, medicineId, key, gate),
            SellOneUnitAsync(branchId, medicineId, key, gate));

        ids[0].ShouldBe(ids[1]);
        (await CountSalesAsync(medicineId)).ShouldBe(1);
        (await OnHandAsync(branchId, medicineId)).ShouldBe(4m);

        // A later replay (timeout retry / offline sync) also resolves to the same sale.
        (await SellOneUnitAsync(branchId, medicineId, key, new StartGate(1))).ShouldBe(ids[0]);
        (await OnHandAsync(branchId, medicineId)).ShouldBe(4m);
    }

    [Fact]
    public async Task Concurrent_Shift_Starts_At_One_Branch_Should_Open_One_Shift()
    {
        var branchId = Guid.CreateVersion7();
        var gate = new StartGate(parties: 2);

        var outcomes = await Task.WhenAll(StartShiftAsync(branchId, gate), StartShiftAsync(branchId, gate));

        outcomes.Count(ok => ok).ShouldBe(1);
        outcomes.Count(ok => !ok).ShouldBe(1);

        var (scope, tenant) = await NewScopeAsync();
        using var scopeHandle = scope;
        scope.ServiceProvider.GetRequiredService<IMultiTenantContextSetter>()
            .MultiTenantContext = new MultiTenantContext<AppTenantInfo>(tenant);
        var db = scope.ServiceProvider.GetRequiredService<SalesDbContext>();
        (await db.CashShifts.CountAsync(s => s.BranchId == branchId && s.Status == CashShiftStatus.Open)).ShouldBe(1);
    }

    [Fact]
    public async Task Ird_Queue_Job_Should_Process_Items_Under_Their_Tenant()
    {
        var branchId = await TenantBranchIdAsync();
        Guid itemId = await SeedQueuedSaleAsync(branchId);

        // The job runs like Hangfire runs it: a scope with NO tenant context.
        using (var jobScope = _factory.Services.CreateScope())
        {
            var job = ActivatorUtilities.CreateInstance<ProcessIrdInvoiceQueueJob>(jobScope.ServiceProvider);
            await job.RunAsync(CancellationToken.None);
        }

        var (checkScope, checkTenant) = await NewScopeAsync();
        using var checkHandle = checkScope;
        checkScope.ServiceProvider.GetRequiredService<IMultiTenantContextSetter>()
            .MultiTenantContext = new MultiTenantContext<AppTenantInfo>(checkTenant);
        var checkDb = checkScope.ServiceProvider.GetRequiredService<SalesDbContext>();
        var processed = await checkDb.IrdInvoiceQueues.AsNoTracking().FirstAsync(q => q.Id == itemId);
        // Whatever the (unconfigured) IRD endpoint answered, the attempt was claimed and saved.
        processed.Attempts.ShouldBe(1);
        processed.Status.ShouldNotBe(IrdQueueStatus.Processing);
    }

    // ---------------------------------------------------------------------------------------------

    private async Task<Guid> SellOneUnitAsync(Guid branchId, Guid medicineId, string key, StartGate gate)
    {
        var (scope, tenant) = await NewScopeAsync();
        using var scopeHandle = scope;
        scope.ServiceProvider.GetRequiredService<IMultiTenantContextSetter>()
            .MultiTenantContext = new MultiTenantContext<AppTenantInfo>(tenant);

        var inventory = scope.ServiceProvider.GetRequiredService<InventoryDbContext>();
        IStockDeductionService stock = new StockDeductionService(inventory, new FixedBranch(branchId));
        var handler = ActivatorUtilities.CreateInstance<CreateSaleCommandHandler>(scope.ServiceProvider, stock, new FixedBranch(branchId));

        var command = new CreateSaleCommand(
            CustomerId: null,
            Items: [new SaleItemInput(medicineId, 1m, 10m, 0m)],
            PaymentMethod: "Cash",
            PaymentAmount: 10m,
            ClientRequestId: key);

        await gate.ArriveAsync();
        return await handler.Handle(command, CancellationToken.None);
    }

    private async Task<bool> StartShiftAsync(Guid branchId, StartGate gate)
    {
        var (scope, tenant) = await NewScopeAsync();
        using var scopeHandle = scope;
        scope.ServiceProvider.GetRequiredService<IMultiTenantContextSetter>()
            .MultiTenantContext = new MultiTenantContext<AppTenantInfo>(tenant);

        var handler = ActivatorUtilities.CreateInstance<StartCashShiftCommandHandler>(scope.ServiceProvider, new FixedBranch(branchId));
        await gate.ArriveAsync();
        try
        {
            await handler.Handle(new StartCashShiftCommand(1000m, null), CancellationToken.None);
            return true;
        }
        catch (CustomException ex) when (ex.StatusCode == System.Net.HttpStatusCode.Conflict)
        {
            return false;
        }
    }

    private async Task<Guid> SeedQueuedSaleAsync(Guid branchId)
    {
        var (scope, tenant) = await NewScopeAsync();
        using var scopeHandle = scope;
        scope.ServiceProvider.GetRequiredService<IMultiTenantContextSetter>()
            .MultiTenantContext = new MultiTenantContext<AppTenantInfo>(tenant);

        var db = scope.ServiceProvider.GetRequiredService<SalesDbContext>();
        var sale = Sale.StartBuilding(branchId, null, null, null);
        sale.AddItem(Guid.CreateVersion7(), 1m, 10m, 0m, 0m, 5m);
        sale.Finalize("Cash", sale.TotalAmount);
        db.Sales.Add(sale);
        var item = IrdInvoiceQueueEntry.Enqueue(sale.Id, "{\"invoiceNumber\":\"T-1\"}");
        db.IrdInvoiceQueues.Add(item);
        await db.SaveChangesAsync();
        return item.Id;
    }

    private async Task<Guid> SeedMedicineWithBatchAsync(Guid branchId, decimal quantityOnHand)
    {
        var (scope, tenant) = await NewScopeAsync();
        using var scopeHandle = scope;
        scope.ServiceProvider.GetRequiredService<IMultiTenantContextSetter>()
            .MultiTenantContext = new MultiTenantContext<AppTenantInfo>(tenant);

        var db = scope.ServiceProvider.GetRequiredService<InventoryDbContext>();
        var medicine = Medicine.Create(
            name: $"Idem {Guid.CreateVersion7():N}"[..20], genericName: null, categoryId: null,
            reorderLevel: 0m, unitPrice: 10m, costPrice: 5m);
        db.Medicines.Add(medicine);
        db.MedicineBatches.Add(MedicineBatch.Create(
            medicine.Id, branchId, $"IDEM-{Guid.CreateVersion7():N}"[..16],
            DateOnly.FromDateTime(DateTime.UtcNow.AddYears(1)), quantityOnHand, 5m, 10m, rackLocation: null));
        await db.SaveChangesAsync();
        return medicine.Id;
    }

    private async Task<int> CountSalesAsync(Guid medicineId)
    {
        var (scope, tenant) = await NewScopeAsync();
        using var scopeHandle = scope;
        scope.ServiceProvider.GetRequiredService<IMultiTenantContextSetter>()
            .MultiTenantContext = new MultiTenantContext<AppTenantInfo>(tenant);

        var db = scope.ServiceProvider.GetRequiredService<SalesDbContext>();
        return await db.Sales.AsNoTracking().CountAsync(s => s.Items.Any(i => i.MedicineId == medicineId));
    }

    private async Task<decimal> OnHandAsync(Guid branchId, Guid medicineId)
    {
        var (scope, tenant) = await NewScopeAsync();
        using var scopeHandle = scope;
        scope.ServiceProvider.GetRequiredService<IMultiTenantContextSetter>()
            .MultiTenantContext = new MultiTenantContext<AppTenantInfo>(tenant);

        var db = scope.ServiceProvider.GetRequiredService<InventoryDbContext>();
        return await db.MedicineBatches.AsNoTracking()
            .Where(b => b.BranchId == branchId && b.MedicineId == medicineId)
            .SumAsync(b => b.QuantityOnHand);
    }

    private async Task<Guid> TenantBranchIdAsync()
    {
        var (scope, tenant) = await NewScopeAsync();
        using var scopeHandle = scope;
        scope.ServiceProvider.GetRequiredService<IMultiTenantContextSetter>()
            .MultiTenantContext = new MultiTenantContext<AppTenantInfo>(tenant);

        var branches = scope.ServiceProvider.GetRequiredService<IBranchService>();
        if (await branches.GetDefaultBranchIdAsync() is { } defaultBranchId)
        {
            return defaultBranchId;
        }

        var created = await branches.CreateAsync("Idempotency Test Branch", $"IDEM{Guid.CreateVersion7():N}"[..12]);
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

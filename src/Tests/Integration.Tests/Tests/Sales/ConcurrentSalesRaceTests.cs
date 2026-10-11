using System.Data;
using Finbuckle.MultiTenant;
using Finbuckle.MultiTenant.Abstractions;
using FSH.Framework.Core.Exceptions;
using FSH.Framework.Shared.Multitenancy;
using FSH.Modules.Inventory.Contracts.Services;
using FSH.Modules.Inventory.Data;
using FSH.Modules.Inventory.Domain;
using FSH.Modules.Inventory.Services;
using FSH.Modules.Multitenancy.Contracts;
using FSH.Modules.Sales.Contracts.v1.Refunds;
using FSH.Modules.Sales.Contracts.v1.Returns;
using FSH.Modules.Sales.Contracts.v1.Sales;
using FSH.Modules.Sales.Data;
using FSH.Modules.Sales.Domain;
using FSH.Modules.Sales.Features.v1.Refunds.CreateRefund;
using FSH.Modules.Sales.Features.v1.Returns.CreateReturn;
using FSH.Modules.Sales.Features.v1.Sales.CreateSale;
using Integration.Tests.Infrastructure;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Shouldly;

namespace Integration.Tests.Tests.Sales;

/// <summary>
/// Races concurrent writers against real PostgreSQL to prove the row locks hold: FEFO stock
/// deduction (<c>SELECT ... FOR UPDATE</c> on candidate batches), sale creation (the full handler,
/// in one transaction with the deduction), and returns/refunds (<c>FOR UPDATE</c> on the parent
/// sale). Each contender runs in its own DI scope with its own DbContexts on the shared connection,
/// the way two HTTP requests would.
///
/// Both contenders are released together through a start gate, after each has opened its
/// transaction, so the second one reaches the lock while the first still holds it.
/// </summary>
[Collection(FshCollectionDefinition.Name)]
public sealed class ConcurrentSalesRaceTests
{
    private readonly FshWebApplicationFactory _factory;

    public ConcurrentSalesRaceTests(FshWebApplicationFactory factory)
    {
        _factory = factory;
    }

    private enum Outcome
    {
        Succeeded,
        Rejected,
    }

    [Fact]
    public async Task Concurrent_Deductions_Of_The_Last_Unit_Should_Not_Oversell()
    {
        // Arrange — one unit on hand, two contenders each want one.
        var branchId = Guid.CreateVersion7();
        var medicineId = Guid.CreateVersion7();
        await SeedBatchAsync(branchId, medicineId, quantityOnHand: 1m);

        var gate = new StartGate(parties: 2);

        // Act
        var outcomes = await Task.WhenAll(
            DeductOneUnitAsync(branchId, medicineId, gate),
            DeductOneUnitAsync(branchId, medicineId, gate));

        // Assert — exactly one sale wins; the loser is refused, not silently given a negative batch.
        outcomes.Count(o => o == Outcome.Succeeded).ShouldBe(1);
        outcomes.Count(o => o == Outcome.Rejected).ShouldBe(1);
        (await OnHandAsync(branchId, medicineId)).ShouldBe(0m);
        (await CountDeductionsAsync(branchId, medicineId)).ShouldBe(1);
    }

    [Fact]
    public async Task Concurrent_Sales_Of_The_Last_Unit_Should_Sell_It_Once()
    {
        // Arrange — same race, through the real CreateSaleCommandHandler (sale row + deduction + outbox
        // in one transaction). The handler's own branch resolver is faked, but the queries it sends
        // through the mediator use the real one, so the sale must be on the tenant's real branch.
        var branchId = await TenantBranchIdAsync();
        var medicineId = await SeedMedicineWithBatchAsync(branchId, quantityOnHand: 1m);

        var gate = new StartGate(parties: 2);

        // Act
        var outcomes = await Task.WhenAll(
            SellOneUnitAsync(branchId, medicineId, gate),
            SellOneUnitAsync(branchId, medicineId, gate));

        // Assert
        outcomes.Count(o => o == Outcome.Succeeded).ShouldBe(1);
        outcomes.Count(o => o == Outcome.Rejected).ShouldBe(1);
        (await OnHandAsync(branchId, medicineId)).ShouldBe(0m);

        // Only the winning sale's row exists (the loser rolled back entirely). Counted by this test's
        // own medicine: the tenant branch is shared with other tests' sales.
        (await CountSalesAsync(medicineId)).ShouldBe(1);
    }

    [Fact]
    public async Task Concurrent_Returns_Of_The_Same_Sale_Line_Should_Not_Double_Return()
    {
        // Arrange — a sold unit; two customers each try to return that one unit at the same time.
        var branchId = Guid.CreateVersion7();
        var (saleId, saleItemId) = await SeedSaleAsync(branchId, quantity: 1m, unitPrice: 10m);

        var gate = new StartGate(parties: 2);

        // Act
        var outcomes = await Task.WhenAll(
            CreateReturnAsync(branchId, saleId, saleItemId, gate),
            CreateReturnAsync(branchId, saleId, saleItemId, gate));

        // Assert — exactly one return; the other sees the first one's committed quantity and is refused.
        outcomes.Count(o => o == Outcome.Succeeded).ShouldBe(1);
        outcomes.Count(o => o == Outcome.Rejected).ShouldBe(1);
        (await ReturnedQuantityAsync(saleItemId)).ShouldBe(1m);
    }

    [Fact]
    public async Task Concurrent_Refunds_Of_The_Same_Sale_Line_Should_Not_Double_Refund()
    {
        // Arrange — one unit sold for 10. Two refunds of that unit race, which would refund 20 on a 10 sale.
        // A real branch: the refund's invoice number is built from the branch row.
        var branchId = await TenantBranchIdAsync();
        var (saleId, saleItemId) = await SeedSaleAsync(branchId, quantity: 1m, unitPrice: 10m);

        var gate = new StartGate(parties: 2);

        // Act
        var outcomes = await Task.WhenAll(
            CreateRefundAsync(branchId, saleId, saleItemId, gate),
            CreateRefundAsync(branchId, saleId, saleItemId, gate));

        // Assert
        outcomes.Count(o => o == Outcome.Succeeded).ShouldBe(1);
        outcomes.Count(o => o == Outcome.Rejected).ShouldBe(1);
        (await RefundedQuantityAsync(saleItemId)).ShouldBe(1m);
    }

    // ---------------------------------------------------------------------------------------------
    // Contenders. Each opens its own scope and installs the tenant INLINE in the same method that
    // uses the DbContexts (Finbuckle's tenant context is AsyncLocal).
    // ---------------------------------------------------------------------------------------------

    private async Task<Outcome> DeductOneUnitAsync(Guid branchId, Guid medicineId, StartGate gate)
    {
        var (scope, tenant) = await NewScopeAsync();
        using var scopeHandle = scope;
        scope.ServiceProvider.GetRequiredService<IMultiTenantContextSetter>()
            .MultiTenantContext = new MultiTenantContext<AppTenantInfo>(tenant);

        var db = scope.ServiceProvider.GetRequiredService<InventoryDbContext>();
        var sut = new StockDeductionService(db, new FixedBranch(branchId));

        // Same shape as CreateSaleCommandHandler: the sale's transaction is open before the deduction.
        await using var transaction = await db.Database.BeginTransactionAsync(IsolationLevel.ReadCommitted);
        await gate.ArriveAsync();

        try
        {
            await sut.DeductForSaleAsync(
                new StockDeductionRequest("Sale", Guid.CreateVersion7(), [new StockDeductionLine(medicineId, 1m)]),
                CancellationToken.None);
            await transaction.CommitAsync();
            return Outcome.Succeeded;
        }
        catch (InsufficientStockException)
        {
            await transaction.RollbackAsync();
            return Outcome.Rejected;
        }
    }

    private async Task<Outcome> SellOneUnitAsync(Guid branchId, Guid medicineId, StartGate gate)
    {
        var (scope, tenant) = await NewScopeAsync();
        using var scopeHandle = scope;
        scope.ServiceProvider.GetRequiredService<IMultiTenantContextSetter>()
            .MultiTenantContext = new MultiTenantContext<AppTenantInfo>(tenant);

        var db = scope.ServiceProvider.GetRequiredService<InventoryDbContext>();
        IStockDeductionService stock = new StockDeductionService(db, new FixedBranch(branchId));

        // Only ICurrentBranch is faked. Dispensing safety, mediator (pharmacy settings) and outbox are real.
        var handler = ActivatorUtilities.CreateInstance<CreateSaleCommandHandler>(
            scope.ServiceProvider, stock, new FixedBranch(branchId));

        var command = new CreateSaleCommand(
            CustomerId: null,
            Items: [new SaleItemInput(medicineId, 1m, 10m, 0m)],
            PaymentMethod: "Cash",
            PaymentAmount: 10m);

        // The handler opens its transaction itself; the gate just lines the two sales up on the lock.
        await gate.ArriveAsync();

        try
        {
            await handler.Handle(command, CancellationToken.None);
            return Outcome.Succeeded;
        }
        catch (InsufficientStockException)
        {
            return Outcome.Rejected;
        }
    }

    private async Task<Outcome> CreateReturnAsync(Guid branchId, Guid saleId, Guid saleItemId, StartGate gate)
    {
        var (scope, tenant) = await NewScopeAsync();
        using var scopeHandle = scope;
        scope.ServiceProvider.GetRequiredService<IMultiTenantContextSetter>()
            .MultiTenantContext = new MultiTenantContext<AppTenantInfo>(tenant);

        var handler = ActivatorUtilities.CreateInstance<CreateReturnCommandHandler>(
            scope.ServiceProvider, new FixedBranch(branchId));

        var command = new CreateReturnCommand(
            SaleId: saleId,
            CustomerId: null,
            ReturnDateUtc: DateTime.UtcNow,
            ReturnItems: [new ReturnItemInput(saleItemId, 1m, "Changed mind", "sealed")]);

        await gate.ArriveAsync();
        try
        {
            await handler.Handle(command, CancellationToken.None);
            return Outcome.Succeeded;
        }
        catch (CustomException ex) when (ex.StatusCode == System.Net.HttpStatusCode.Conflict)
        {
            return Outcome.Rejected;
        }
    }

    private async Task<Outcome> CreateRefundAsync(Guid branchId, Guid saleId, Guid saleItemId, StartGate gate)
    {
        var (scope, tenant) = await NewScopeAsync();
        using var scopeHandle = scope;
        scope.ServiceProvider.GetRequiredService<IMultiTenantContextSetter>()
            .MultiTenantContext = new MultiTenantContext<AppTenantInfo>(tenant);

        var handler = ActivatorUtilities.CreateInstance<CreateRefundCommandHandler>(
            scope.ServiceProvider, new FixedBranch(branchId));

        var command = new CreateRefundCommand(
            OriginalSaleId: saleId,
            CustomerId: null,
            RefundDateUtc: DateTime.UtcNow,
            RefundReason: "Duplicate charge",
            RefundItems: [new RefundItemInput(saleItemId, 1m)]);

        await gate.ArriveAsync();
        try
        {
            await handler.Handle(command, CancellationToken.None);
            return Outcome.Succeeded;
        }
        catch (CustomException ex) when (ex.StatusCode == System.Net.HttpStatusCode.Conflict)
        {
            return Outcome.Rejected;
        }
    }

    // ---------------------------------------------------------------------------------------------
    // Seeding and verification.
    // ---------------------------------------------------------------------------------------------

    private async Task SeedBatchAsync(Guid branchId, Guid medicineId, decimal quantityOnHand)
    {
        var (scope, tenant) = await NewScopeAsync();
        using var scopeHandle = scope;
        scope.ServiceProvider.GetRequiredService<IMultiTenantContextSetter>()
            .MultiTenantContext = new MultiTenantContext<AppTenantInfo>(tenant);

        var db = scope.ServiceProvider.GetRequiredService<InventoryDbContext>();
        db.MedicineBatches.Add(MedicineBatch.Create(
            medicineId, branchId, $"RACE-{Guid.CreateVersion7():N}"[..16],
            DateOnly.FromDateTime(DateTime.UtcNow.AddYears(1)), quantityOnHand, 5m, 10m, rackLocation: null));
        await db.SaveChangesAsync();
    }

    private async Task<Guid> SeedMedicineWithBatchAsync(Guid branchId, decimal quantityOnHand)
    {
        var (scope, tenant) = await NewScopeAsync();
        using var scopeHandle = scope;
        scope.ServiceProvider.GetRequiredService<IMultiTenantContextSetter>()
            .MultiTenantContext = new MultiTenantContext<AppTenantInfo>(tenant);

        var db = scope.ServiceProvider.GetRequiredService<InventoryDbContext>();
        var medicine = Medicine.Create(
            name: $"Race {Guid.CreateVersion7():N}"[..20], genericName: null, categoryId: null,
            reorderLevel: 0m, unitPrice: 10m, costPrice: 5m);
        db.Medicines.Add(medicine);
        db.MedicineBatches.Add(MedicineBatch.Create(
            medicine.Id, branchId, $"RACE-{Guid.CreateVersion7():N}"[..16],
            DateOnly.FromDateTime(DateTime.UtcNow.AddYears(1)), quantityOnHand, 5m, 10m, rackLocation: null));
        await db.SaveChangesAsync();
        return medicine.Id;
    }

    private async Task<(Guid SaleId, Guid SaleItemId)> SeedSaleAsync(Guid branchId, decimal quantity, decimal unitPrice)
    {
        var (scope, tenant) = await NewScopeAsync();
        using var scopeHandle = scope;
        scope.ServiceProvider.GetRequiredService<IMultiTenantContextSetter>()
            .MultiTenantContext = new MultiTenantContext<AppTenantInfo>(tenant);

        var db = scope.ServiceProvider.GetRequiredService<SalesDbContext>();
        var sale = FSH.Modules.Sales.Domain.Sale.StartBuilding(branchId, null, null, null);
        sale.AddItem(Guid.CreateVersion7(), quantity, unitPrice, 0m, 0m, 0m);
        sale.Finalize("Cash", sale.TotalAmount);
        db.Sales.Add(sale);
        await db.SaveChangesAsync();

        return (sale.Id, sale.Items.Single().Id);
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

    private async Task<int> CountDeductionsAsync(Guid branchId, Guid medicineId)
    {
        var (scope, tenant) = await NewScopeAsync();
        using var scopeHandle = scope;
        scope.ServiceProvider.GetRequiredService<IMultiTenantContextSetter>()
            .MultiTenantContext = new MultiTenantContext<AppTenantInfo>(tenant);

        var db = scope.ServiceProvider.GetRequiredService<InventoryDbContext>();
        return await db.InventoryTransactions.AsNoTracking()
            .CountAsync(t => t.BranchId == branchId && t.MedicineId == medicineId && t.QuantityDelta < 0);
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

    private async Task<decimal> ReturnedQuantityAsync(Guid saleItemId)
    {
        var (scope, tenant) = await NewScopeAsync();
        using var scopeHandle = scope;
        scope.ServiceProvider.GetRequiredService<IMultiTenantContextSetter>()
            .MultiTenantContext = new MultiTenantContext<AppTenantInfo>(tenant);

        var db = scope.ServiceProvider.GetRequiredService<SalesDbContext>();
        return await db.SaleReturnItems.AsNoTracking()
            .Where(i => i.SaleItemId == saleItemId)
            .SumAsync(i => i.QuantityReturned);
    }

    private async Task<decimal> RefundedQuantityAsync(Guid saleItemId)
    {
        var (scope, tenant) = await NewScopeAsync();
        using var scopeHandle = scope;
        scope.ServiceProvider.GetRequiredService<IMultiTenantContextSetter>()
            .MultiTenantContext = new MultiTenantContext<AppTenantInfo>(tenant);

        var db = scope.ServiceProvider.GetRequiredService<SalesDbContext>();
        return await db.SaleRefundItems.AsNoTracking()
            .Where(i => i.SaleItemId == saleItemId)
            .SumAsync(i => i.QuantityRefunded);
    }

    /// <summary>
    /// The branch the real <see cref="ICurrentBranch"/> resolves for a caller with no selection: the
    /// tenant's default (oldest) branch, created here if the tenant has none yet.
    /// </summary>
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

        var created = await branches.CreateAsync("Race Test Branch", $"RACE{Guid.CreateVersion7():N}"[..12]);
        return created.Id;
    }

    /// <summary>Returns a scope plus the root tenant; the caller installs the tenant context inline.</summary>
    private async Task<(IServiceScope Scope, AppTenantInfo Tenant)> NewScopeAsync()
    {
        var scope = _factory.Services.CreateScope();
        var tenant = await scope.ServiceProvider
            .GetRequiredService<IMultiTenantStore<AppTenantInfo>>()
            .GetAsync(TestConstants.RootTenantId);
        return (scope, tenant!);
    }

    /// <summary>Two-party start gate: both contenders block here after opening their transaction.</summary>
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

    /// <summary>Fixed branch resolver. The race is about row locks, not branch resolution.</summary>
    private sealed class FixedBranch(Guid branchId) : ICurrentBranch
    {
        public Task<Guid?> GetBranchIdAsync(CancellationToken cancellationToken = default) =>
            Task.FromResult<Guid?>(branchId);

        public Task<Guid?> GetListFilterBranchIdAsync(CancellationToken cancellationToken = default) =>
            Task.FromResult<Guid?>(branchId);

        public Task<Guid?> ResolveListBranchFilterAsync(Guid? requestedBranchId, CancellationToken cancellationToken = default) =>
            Task.FromResult<Guid?>(requestedBranchId ?? branchId);

        public Task<bool> CanViewAllBranchesAsync(CancellationToken cancellationToken = default) =>
            Task.FromResult(false);

        public Task<Guid> RequireBranchIdAsync(CancellationToken cancellationToken = default) =>
            Task.FromResult(branchId);
    }
}

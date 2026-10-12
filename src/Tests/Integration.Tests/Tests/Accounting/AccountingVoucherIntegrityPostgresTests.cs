using Finbuckle.MultiTenant;
using Finbuckle.MultiTenant.Abstractions;
using FSH.Framework.Shared.Multitenancy;
using FSH.Modules.Accounting.Contracts.Services;
using FSH.Modules.Accounting.Data;
using FSH.Modules.Accounting.Domain;
using FSH.Modules.Accounting.Services;
using Integration.Tests.Infrastructure;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Shouldly;

namespace Integration.Tests.Tests.Accounting;

/// <summary>
/// Voucher integrity against real PostgreSQL: the per-tenant posting-lock row (unique index + upsert), and the
/// "reversed before posted" tombstone that keeps an out-of-order cancellation from leaving a sale booked.
/// Every test runs in a transaction that is rolled back, so the shared tenant's ledger is untouched.
/// </summary>
[Collection(FshCollectionDefinition.Name)]
public sealed class AccountingVoucherIntegrityPostgresTests
{
    private readonly FshWebApplicationFactory _factory;

    public AccountingVoucherIntegrityPostgresTests(FshWebApplicationFactory factory)
    {
        _factory = factory;
    }

    private async Task<(IServiceScope Scope, AccountingDbContext Db)> TenantScopeAsync()
    {
        var scope = _factory.Services.CreateScope();
        var tenant = await scope.ServiceProvider.GetRequiredService<IMultiTenantStore<AppTenantInfo>>().GetAsync(TestConstants.RootTenantId);
        scope.ServiceProvider.GetRequiredService<IMultiTenantContextSetter>().MultiTenantContext = new MultiTenantContext<AppTenantInfo>(tenant!);
        return (scope, scope.ServiceProvider.GetRequiredService<AccountingDbContext>());
    }

    [Theory]
    [InlineData("IX_PostingLocks_TenantId")]
    [InlineData("IX_PendingReversals_TenantId_ReferenceType_ReferenceId")]
    public async Task Unique_Indexes_Should_Exist(string index)
    {
        var (scope, db) = await TenantScopeAsync();
        using (scope)
        {
            var count = await db.Database.SqlQuery<int>($"""
                SELECT count(*)::int AS "Value" FROM pg_indexes WHERE schemaname = 'accounting' AND indexname = {index}
                """).ToListAsync();

            count.ShouldHaveSingleItem().ShouldBe(1);
        }
    }

    [Fact]
    public async Task PostingLock_Should_Be_Created_Once_Per_Tenant_By_The_Upsert()
    {
        var (scope, db) = await TenantScopeAsync();
        using (scope)
        {
            await using var transaction = await db.Database.BeginTransactionAsync();
            await db.Database.ExecuteSqlAsync($"""DELETE FROM accounting."PostingLocks" WHERE "TenantId" = {db.TenantInfo!.Id}""");

            var first = await new AccountingPostingLockService(db).GetOrCreateAsync();
            db.ChangeTracker.Clear();
            var second = await new AccountingPostingLockService(db).GetOrCreateAsync();

            second.Id.ShouldBe(first.Id);
            (await db.PostingLocks.CountAsync()).ShouldBe(1);
            await transaction.RollbackAsync();
        }
    }

    [Fact]
    public async Task A_Cancellation_Handled_Before_The_Sale_Should_Leave_The_Sale_Posted_And_Reversed()
    {
        var (scope, db) = await TenantScopeAsync();
        using (scope)
        {
            var posting = scope.ServiceProvider.GetRequiredService<IVoucherPostingService>();
            var accounts = scope.ServiceProvider.GetRequiredService<IAccountingAccountResolver>();
            Guid cash = await accounts.ResolveByCodeAsync(AccountingSystemAccountCodes.Cash);
            Guid revenue = await accounts.ResolveByCodeAsync(AccountingSystemAccountCodes.SalesRevenue);
            var saleId = Guid.CreateVersion7();
            var saleDate = DateTime.UtcNow.AddHours(-2);
            var request = new PostVoucherRequest(
                "system_sale", "Sale", saleId, "Sale", [new PostVoucherLine(cash, "Cash", 25m, 0m), new PostVoucherLine(revenue, "Revenue", 0m, 25m)],
                BranchId: Guid.CreateVersion7(), VoucherDateUtc: saleDate);

            await using var transaction = await db.Database.BeginTransactionAsync();

            (await posting.ReverseSystemVoucherAsync("Sale", saleId, "cancelled", DateTime.UtcNow.AddHours(-1))).ShouldBeNull();
            var originalId = await posting.PostSystemVoucherAsync(request);
            (await posting.PostSystemVoucherAsync(request)).ShouldBe(originalId);

            var vouchers = await db.Vouchers.AsNoTracking()
                .Where(v => v.Id == originalId || v.ReversesVoucherId == originalId)
                .ToListAsync();
            vouchers.Count.ShouldBe(2);
            vouchers.Single(v => v.Id == originalId).Status.ShouldBe(AccountingVoucherStatus.Void);
            vouchers.Single(v => v.ReversesVoucherId == originalId).Status.ShouldBe(AccountingVoucherStatus.Posted);
            (await db.PendingReversals.AsNoTracking().SingleAsync(p => p.ReferenceId == saleId)).ResolvedAtUtc.ShouldNotBeNull();

            await transaction.RollbackAsync();
        }
    }
}

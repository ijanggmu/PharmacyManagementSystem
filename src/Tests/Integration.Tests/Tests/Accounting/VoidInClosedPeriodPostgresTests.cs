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
/// A void must never change a closed (posting-locked) period — e.g. a sale cancelled after its month's VAT
/// return was filed. There the void becomes a reversal dated today. Locks only up to 2020, far before any
/// voucher the other tests post, and restores the previous lock date afterwards.
/// </summary>
[Collection(FshCollectionDefinition.Name)]
public sealed class VoidInClosedPeriodPostgresTests
{
    private readonly FshWebApplicationFactory _factory;

    public VoidInClosedPeriodPostgresTests(FshWebApplicationFactory factory)
    {
        _factory = factory;
    }

    [Fact]
    public async Task Voiding_A_Voucher_In_A_Closed_Period_Should_Reverse_It_Today_And_Leave_The_Period_As_Filed()
    {
        using var scope = _factory.Services.CreateScope();
        var tenant = await scope.ServiceProvider.GetRequiredService<IMultiTenantStore<AppTenantInfo>>()
            .GetAsync(TestConstants.RootTenantId);
        scope.ServiceProvider.GetRequiredService<IMultiTenantContextSetter>()
            .MultiTenantContext = new MultiTenantContext<AppTenantInfo>(tenant!);

        var db = scope.ServiceProvider.GetRequiredService<AccountingDbContext>();
        var accounts = scope.ServiceProvider.GetRequiredService<IAccountingAccountResolver>();
        var cash = await accounts.ResolveByCodeAsync(AccountingSystemAccountCodes.Cash);
        var revenue = await accounts.ResolveByCodeAsync(AccountingSystemAccountCodes.SalesRevenue);

        var filedDate = new DateTime(2020, 1, 15, 0, 0, 0, DateTimeKind.Utc);
        var original = AccountingVoucher.CreateDraft(filedDate, "system_sale", AccountingVoucherSource.System, "Filed sale");
        original.AddLine(cash, null, 500m, 0m);
        original.AddLine(revenue, null, 0m, 500m);
        original.Post($"IT-{Guid.CreateVersion7():N}"[..16], "tester");
        db.Vouchers.Add(original);
        await db.SaveChangesAsync();

        var lockService = new AccountingPostingLockService(db);
        var lockRow = await lockService.GetOrCreateAsync();
        DateOnly? previousLock = lockRow.LockDate;
        lockRow.SetLockDate(new DateOnly(2020, 1, 31), "auditor");
        await db.SaveChangesAsync();

        try
        {
            await scope.ServiceProvider.GetRequiredService<IVoucherPostingService>().VoidAsync(original.Id, "Sale cancelled");

            db.ChangeTracker.Clear();
            var reversal = await db.Vouchers.Include(v => v.Lines).SingleAsync(v => v.ReversesVoucherId == original.Id);
            reversal.Status.ShouldBe(AccountingVoucherStatus.Posted);
            reversal.VoucherDateUtc.Date.ShouldBe(DateTime.UtcNow.Date);
            reversal.Lines.Sum(l => l.CreditAmount).ShouldBe(500m);
        }
        finally
        {
            db.ChangeTracker.Clear();
            var restore = await lockService.GetOrCreateAsync();
            restore.SetLockDate(previousLock, "auditor");
            await db.SaveChangesAsync();
        }
    }
}

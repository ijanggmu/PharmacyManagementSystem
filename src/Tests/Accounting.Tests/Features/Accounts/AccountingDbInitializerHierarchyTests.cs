using FSH.Modules.Multitenancy.Contracts;
using NSubstitute;
using FSH.Modules.Accounting.Data;
using FSH.Modules.Accounting.Domain;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging.Abstractions;

namespace Accounting.Tests.Features.Accounts;

/// <summary>Seeding builds the chart tree: root heads, standard accounts under them, and pre-hierarchy rows attached.</summary>
public sealed class AccountingDbInitializerHierarchyTests : IDisposable
{
    private readonly AccountingDbContext _db = AccountingDbContextFactory.Create();

    private Task SeedAsync() =>
        new AccountingDbInitializer(_db, Substitute.For<IBranchService>(), NullLogger<AccountingDbInitializer>.Instance).SeedAsync(CancellationToken.None);

    [Fact]
    public async Task Seed_Should_CreateRootHeads_And_PlaceStandardAccountsUnderThem()
    {
        await SeedAsync();

        var accounts = await _db.Accounts.AsNoTracking().ToListAsync();
        var roots = accounts.Where(a => a.IsRootHead).ToList();
        roots.Select(r => r.Code).ShouldBe(["1", "2", "3", "4", "5"], ignoreOrder: true);
        accounts.Where(a => !a.IsRootHead).ShouldAllBe(a => a.ParentId != null);
        accounts.Single(a => a.Code == "1000").ParentId.ShouldBe(roots.Single(r => r.Code == "1").Id);
    }

    [Fact]
    public async Task Seed_Should_AttachPreHierarchyAccounts_AndBeIdempotent()
    {
        var legacy = AccountingAccount.Create("6100", "Legacy expense", AccountingAccountType.Expense);
        _db.Accounts.Add(legacy);
        await _db.SaveChangesAsync();

        await SeedAsync();
        await SeedAsync();

        var expenses = await _db.Accounts.AsNoTracking().SingleAsync(a => a.Code == "5");
        (await _db.Accounts.AsNoTracking().SingleAsync(a => a.Id == legacy.Id)).ParentId.ShouldBe(expenses.Id);
        (await _db.Accounts.CountAsync(a => a.Code == "5")).ShouldBe(1);
    }

    public void Dispose() => _db.Dispose();
}

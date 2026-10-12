using System.Net.Http.Json;
using Finbuckle.MultiTenant;
using Finbuckle.MultiTenant.Abstractions;
using FSH.Framework.Shared.Multitenancy;
using FSH.Modules.Accounting.Contracts.Services;
using FSH.Modules.Accounting.Data;
using FSH.Modules.Customers.Data;
using FSH.Modules.Customers.Domain;
using Integration.Tests.Infrastructure;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Shouldly;

namespace Integration.Tests.Tests.Customers;

/// <summary>
/// A customer created with an opening balance: the AR ledger entry and the outbox event commit with the
/// customer, and Accounting posts Dr Accounts Receivable / Cr Owner's Equity for it — once.
/// </summary>
[Collection(FshCollectionDefinition.Name)]
public sealed class CustomerOpeningBalancePostgresTests
{
    private readonly FshWebApplicationFactory _factory;
    private readonly AuthHelper _auth;

    public CustomerOpeningBalancePostgresTests(FshWebApplicationFactory factory)
    {
        _factory = factory;
        _auth = new AuthHelper(factory);
    }

    [Fact]
    public async Task Opening_Balance_Should_Post_A_Balanced_AR_Voucher()
    {
        using var client = await _auth.CreateRootAdminClientAsync();
        var response = await client.PostAsJsonAsync("/api/v1/customers", new { name = "Opening Balance Customer", openingBalance = 750.25m });
        response.EnsureSuccessStatusCode();
        var customerId = await response.Content.ReadFromJsonAsync<Guid>();

        await OutboxDrain.DrainAsync(_factory.Services);
        await OutboxDrain.DrainAsync(_factory.Services); // a redelivery must not post a second voucher

        using var scope = _factory.Services.CreateScope();
        var tenant = await scope.ServiceProvider.GetRequiredService<IMultiTenantStore<AppTenantInfo>>()
            .GetAsync(TestConstants.RootTenantId);
        scope.ServiceProvider.GetRequiredService<IMultiTenantContextSetter>()
            .MultiTenantContext = new MultiTenantContext<AppTenantInfo>(tenant!);

        var entry = await scope.ServiceProvider.GetRequiredService<CustomersDbContext>().CustomerLedgerEntries
            .SingleAsync(e => e.CustomerId == customerId);
        entry.EntryType.ShouldBe(CustomerLedgerEntryType.OpeningBalance);
        entry.DebitAmount.ShouldBe(750.25m);

        var accounting = scope.ServiceProvider.GetRequiredService<AccountingDbContext>();
        var voucher = await accounting.Vouchers.SingleAsync(v => v.ReferenceType == "CustomerOpeningBalance" && v.ReferenceId == entry.Id);
        var lines = await accounting.VoucherLines.Where(l => l.VoucherId == voucher.Id).ToListAsync();
        var resolver = scope.ServiceProvider.GetRequiredService<IAccountingAccountResolver>();
        var arId = await resolver.ResolveByCodeAsync(AccountingSystemAccountCodes.AccountsReceivable);
        var equityId = await resolver.ResolveByCodeAsync(AccountingSystemAccountCodes.OwnersEquity);

        lines.Count.ShouldBe(2);
        lines.Single(l => l.AccountId == arId).DebitAmount.ShouldBe(750.25m);
        lines.Single(l => l.AccountId == equityId).CreditAmount.ShouldBe(750.25m);
    }
}

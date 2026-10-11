using System.Net;
using System.Net.Http.Json;
using Finbuckle.MultiTenant;
using Finbuckle.MultiTenant.Abstractions;
using FSH.Framework.Shared.Multitenancy;
using FSH.Modules.Sales.Data;
using FSH.Modules.Sales.Domain;
using Integration.Tests.Infrastructure;
using Integration.Tests.Infrastructure.Extensions;
using Microsoft.Extensions.DependencyInjection;
using Shouldly;

namespace Integration.Tests.Tests.Sales;

/// <summary>
/// End-to-end invoice print recording against real PostgreSQL: POST /sales/{id}/prints numbers each
/// print (1 = original, 2+ = copy) and GET /sales/{id} reports the print count the print dialog uses to
/// mark reprints "COPY OF ORIGINAL".
/// </summary>
[Collection(FshCollectionDefinition.Name)]
public sealed class SalePrintEndpointTests
{
    private const string SalesPath = "/api/v1/sales";
    private readonly FshWebApplicationFactory _factory;
    private readonly AuthHelper _auth;

    public SalePrintEndpointTests(FshWebApplicationFactory factory)
    {
        _factory = factory;
        _auth = new AuthHelper(factory);
    }

    [Fact]
    public async Task Second_Print_Should_Be_A_Copy_And_Count_Should_Show_On_The_Sale()
    {
        using var client = await _auth.CreateRootAdminClientAsync();
        var saleId = await SeedSaleAsync(invoiceNumber: $"INV-TEST-2083/84-{Guid.NewGuid():N}"[..28]);

        var first = await client.PostAsJsonAsync($"{SalesPath}/{saleId}/prints", new { saleId, format = "thermal-80" });
        first.StatusCode.ShouldBe(HttpStatusCode.OK, await first.Content.ReadAsStringAsync());
        var firstResult = await first.DeserializeAsync<PrintResult>();
        firstResult.PrintNumber.ShouldBe(1);
        firstResult.IsCopy.ShouldBeFalse();

        var second = await client.PostAsJsonAsync($"{SalesPath}/{saleId}/prints", new { saleId, format = "a5" });
        second.StatusCode.ShouldBe(HttpStatusCode.OK, await second.Content.ReadAsStringAsync());
        var secondResult = await second.DeserializeAsync<PrintResult>();
        secondResult.PrintNumber.ShouldBe(2);
        secondResult.IsCopy.ShouldBeTrue();

        var sale = await client.GetAsync($"{SalesPath}/{saleId}");
        sale.StatusCode.ShouldBe(HttpStatusCode.OK);
        var dto = await sale.DeserializeAsync<SaleView>();
        dto.PrintCount.ShouldBe(2);
        dto.InvoiceNumber.ShouldNotBeNullOrWhiteSpace();
    }

    [Fact]
    public async Task Printing_A_Sale_Without_An_Invoice_Number_Should_Issue_One_And_Record_The_Print()
    {
        using var client = await _auth.CreateRootAdminClientAsync();
        var saleId = await SeedSaleAsync(invoiceNumber: null);

        var response = await client.PostAsJsonAsync($"{SalesPath}/{saleId}/prints", new { saleId, format = "thermal-80" });
        response.StatusCode.ShouldBe(HttpStatusCode.OK, await response.Content.ReadAsStringAsync());
        var result = await response.DeserializeAsync<PrintResult>();
        result.PrintNumber.ShouldBe(1);
        result.InvoiceNumber.ShouldNotBeNullOrWhiteSpace();

        var dto = await (await client.GetAsync($"{SalesPath}/{saleId}")).DeserializeAsync<SaleView>();
        dto.InvoiceNumber.ShouldBe(result.InvoiceNumber);
        dto.PrintCount.ShouldBe(1);
    }

    private async Task<Guid> SeedSaleAsync(string? invoiceNumber)
    {
        using var scope = _factory.Services.CreateScope();
        var tenant = await scope.ServiceProvider.GetRequiredService<IMultiTenantStore<AppTenantInfo>>()
            .GetAsync(TestConstants.RootTenantId);
        scope.ServiceProvider.GetRequiredService<IMultiTenantContextSetter>()
            .MultiTenantContext = new MultiTenantContext<AppTenantInfo>(tenant!);

        var db = scope.ServiceProvider.GetRequiredService<SalesDbContext>();
        // A real branch: the invoice number embeds the branch code, looked up at print time.
        var branches = scope.ServiceProvider.GetRequiredService<FSH.Modules.Multitenancy.Contracts.IBranchService>();
        var branchId = await branches.GetDefaultBranchIdAsync()
            ?? (await branches.CreateAsync("Print test branch", $"PT{Guid.NewGuid():N}"[..8].ToUpperInvariant())).Id;
        var sale = Sale.StartBuilding(branchId, null, null, null);
        sale.AddItem(Guid.CreateVersion7(), 2m, 50m, 0m, 0m, 20m);
        sale.Finalize("Cash", sale.TotalAmount);
        sale.ApplyVat(13m);
        if (invoiceNumber is not null)
        {
            sale.AssignInvoice(invoiceNumber, 2083);
        }

        db.Sales.Add(sale);
        await db.SaveChangesAsync();
        return sale.Id;
    }

    private sealed record PrintResult(Guid SaleId, int PrintNumber, bool IsCopy, DateTime PrintedAtUtc, string? InvoiceNumber);

    private sealed record SaleView(Guid Id, string? InvoiceNumber, int PrintCount);
}

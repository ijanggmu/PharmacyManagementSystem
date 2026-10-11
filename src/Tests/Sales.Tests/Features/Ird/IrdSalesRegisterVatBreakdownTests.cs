using FSH.Modules.Multitenancy.Contracts;
using FSH.Modules.Sales.Contracts.v1.Ird;
using FSH.Modules.Sales.Data;
using FSH.Modules.Sales.Domain;
using FSH.Modules.Sales.Features.v1.Ird.GetIrdSalesRegister;
using Mediator;
using NSubstitute;

namespace Sales.Tests.Features.Ird;

/// <summary>The IRD sales register's Taxable column excludes VAT-exempt sales; Exempt is its own column.</summary>
public sealed class IrdSalesRegisterVatBreakdownTests : IDisposable
{
    private readonly SalesDbContext _db = SalesDbContextFactory.Create();

    public void Dispose() => _db.Dispose();

    [Fact]
    public async Task Handle_Should_Return_StoredTaxableAndExempt_Amounts()
    {
        var sale = Sale.StartBuilding(Guid.CreateVersion7(), null, null, null);
        sale.AddItem(Guid.CreateVersion7(), 1m, 113m, 0m, 0m, 50m, isTaxable: true);
        sale.AddItem(Guid.CreateVersion7(), 1m, 40m, 0m, 0m, 20m, isTaxable: false);
        sale.ApplyVat(13m);
        sale.Finalize("Cash", sale.TotalAmount);
        _db.Sales.Add(sale);
        await _db.SaveChangesAsync(CancellationToken.None);

        var currentBranch = Substitute.For<ICurrentBranch>();
        var sut = new GetIrdSalesRegisterQueryHandler(_db, Substitute.For<IMediator>(), currentBranch);
        var row = (await sut.Handle(
            new GetIrdSalesRegisterQuery(sale.SaleDateUtc.AddDays(-1), sale.SaleDateUtc.AddDays(1)), CancellationToken.None))
            .ShouldHaveSingleItem();

        row.TotalAmount.ShouldBe(153m);
        row.TaxAmount.ShouldBe(13m);
        row.TaxableAmount.ShouldBe(100m);
        row.ExemptAmount.ShouldBe(40m);
        (row.TaxableAmount + row.TaxAmount + row.ExemptAmount).ShouldBe(row.TotalAmount);
    }

    [Fact]
    public void VatBreakdown_Should_DeriveTaxableFromVat_ForLegacySales()
    {
        // Legacy sale: VAT stored, no breakdown, no rate → taxable = 13 / 13%, exempt = the rest.
        var (taxable, exempt) = GetIrdSalesRegisterQueryHandler.VatBreakdown(153m, 13m, null, null, null);

        taxable.ShouldBe(100m);
        exempt.ShouldBe(40m);
    }

    [Fact]
    public void VatBreakdown_Should_UseTheStoredRate_When_Present()
    {
        var (taxable, exempt) = GetIrdSalesRegisterQueryHandler.VatBreakdown(115m, 15m, null, null, 15m);

        taxable.ShouldBe(100m);
        exempt.ShouldBe(0m);
    }

    [Fact]
    public void VatBreakdown_Should_BeUnknown_When_VatIsUnknown()
    {
        GetIrdSalesRegisterQueryHandler.VatBreakdown(100m, null, null, null, null).ShouldBe((null, null));
    }
}

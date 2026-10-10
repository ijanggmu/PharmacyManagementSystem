using FSH.Modules.Suppliers.Contracts.v1.Suppliers;
using FSH.Modules.Suppliers.Data;
using FSH.Modules.Suppliers.Domain;
using FSH.Modules.Suppliers.Features.v1.Suppliers.SearchSuppliers;

namespace Suppliers.Tests.Features;

public sealed class SearchSuppliersQueryHandlerTests : IDisposable
{
    private readonly SuppliersDbContext _db = SuppliersDbContextFactory.Create();
    private readonly SearchSuppliersQueryHandler _sut;

    public SearchSuppliersQueryHandlerTests()
    {
        _sut = new SearchSuppliersQueryHandler(_db);
    }

    private async Task SeedAsync()
    {
        var inactiveComplete = Supplier.Create("Old Complete", "Hari", "9800000004", "old@example.com", null, null, 0m);
        inactiveComplete.Update("Old Complete", "Hari", "9800000004", "old@example.com", null, null, isActive: false);

        _db.Suppliers.AddRange(
            Supplier.Create("Complete Pharma", "Sita", "9800000001", "sita@example.com", null, null, 0m),
            Supplier.Create("No Email Traders", "Ram", "9800000002", null, null, null, 0m),
            Supplier.Create("No Contact House", null, "9800000003", "house@example.com", null, null, 0m),
            inactiveComplete);
        await _db.SaveChangesAsync(CancellationToken.None);
    }

    [Fact]
    public async Task Handle_Should_Return_Only_Complete_Profiles_When_IsComplete_True()
    {
        await SeedAsync();

        var result = await _sut.Handle(new SearchSuppliersQuery(IsComplete: true), CancellationToken.None);

        result.Items.Select(s => s.Name).ShouldBe(["Complete Pharma", "Old Complete"]);
        result.TotalCount.ShouldBe(2);
    }

    [Fact]
    public async Task Handle_Should_Return_Profiles_Missing_Any_Contact_Detail_When_IsComplete_False()
    {
        await SeedAsync();

        var result = await _sut.Handle(new SearchSuppliersQuery(IsComplete: false), CancellationToken.None);

        result.Items.Select(s => s.Name).ShouldBe(["No Contact House", "No Email Traders"]);
        result.TotalCount.ShouldBe(2);
    }

    [Fact]
    public async Task Handle_Should_Combine_IsComplete_With_IsActive()
    {
        await SeedAsync();

        var result = await _sut.Handle(new SearchSuppliersQuery(IsActive: true, IsComplete: true), CancellationToken.None);

        result.Items.Single().Name.ShouldBe("Complete Pharma");
    }

    [Fact]
    public async Task Handle_Should_Return_Every_Supplier_When_No_Filter()
    {
        await SeedAsync();

        var result = await _sut.Handle(new SearchSuppliersQuery(), CancellationToken.None);

        result.TotalCount.ShouldBe(4);
    }

    public void Dispose() => _db.Dispose();
}

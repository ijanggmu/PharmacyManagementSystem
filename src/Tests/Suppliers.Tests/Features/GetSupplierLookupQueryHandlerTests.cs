using FSH.Modules.Suppliers.Contracts.v1.Suppliers;
using FSH.Modules.Suppliers.Data;
using FSH.Modules.Suppliers.Domain;
using FSH.Modules.Suppliers.Features.v1.Suppliers.GetSupplierLookup;
using FSH.Modules.Suppliers.Features.v1.Suppliers.SearchSuppliers;

namespace Suppliers.Tests.Features;

public sealed class GetSupplierLookupQueryHandlerTests : IDisposable
{
    private readonly SuppliersDbContext _db = SuppliersDbContextFactory.Create();
    private readonly GetSupplierLookupQueryHandler _sut;

    public GetSupplierLookupQueryHandlerTests()
    {
        _sut = new GetSupplierLookupQueryHandler(_db);
    }

    private async Task<(Supplier Himal, Supplier Nepal, Supplier Inactive)> SeedAsync()
    {
        var himal = Supplier.Create("Himal Pharma", null, "9800000001", null, null, null, 0m);
        var nepal = Supplier.Create("Nepal Drug House", null, "01-4000000", null, null, null, 0m);
        var inactive = Supplier.Create("Old Traders", null, null, null, null, null, 0m);
        inactive.Update("Old Traders", null, null, null, null, null, isActive: false);

        _db.Suppliers.AddRange(nepal, inactive, himal);
        await _db.SaveChangesAsync(CancellationToken.None);
        return (himal, nepal, inactive);
    }

    [Fact]
    public async Task Handle_Should_Return_ActiveSuppliers_OrderedByName_ByDefault()
    {
        await SeedAsync();

        var result = await _sut.Handle(new GetSupplierLookupQuery(), CancellationToken.None);

        result.Select(s => s.Name).ShouldBe(["Himal Pharma", "Nepal Drug House"]);
        result.ShouldAllBe(s => s.IsActive);
    }

    [Fact]
    public async Task Handle_Should_Include_Inactive_When_Requested()
    {
        await SeedAsync();

        var result = await _sut.Handle(new GetSupplierLookupQuery(IncludeInactive: true), CancellationToken.None);

        result.Count.ShouldBe(3);
    }

    [Fact]
    public async Task Handle_Should_Search_Name_And_Phone_CaseInsensitively()
    {
        await SeedAsync();

        var byName = await _sut.Handle(new GetSupplierLookupQuery(Search: "himal"), CancellationToken.None);
        var byPhone = await _sut.Handle(new GetSupplierLookupQuery(Search: "01-40"), CancellationToken.None);

        byName.Single().Name.ShouldBe("Himal Pharma");
        byPhone.Single().Name.ShouldBe("Nepal Drug House");
    }

    [Fact]
    public async Task Handle_Should_Return_Requested_Ids_Including_Inactive()
    {
        var (himal, _, inactive) = await SeedAsync();

        var result = await _sut.Handle(
            new GetSupplierLookupQuery(Ids: [himal.Id, inactive.Id, Guid.CreateVersion7()]), CancellationToken.None);

        result.Select(s => s.Id).ShouldBe([himal.Id, inactive.Id], ignoreOrder: true);
    }

    [Fact]
    public async Task Handle_Should_Cap_Rows_At_Limit()
    {
        for (int i = 0; i < 5; i++)
        {
            _db.Suppliers.Add(Supplier.Create($"Supplier {i}", null, null, null, null, null, 0m));
        }

        await _db.SaveChangesAsync(CancellationToken.None);

        var result = await _sut.Handle(new GetSupplierLookupQuery(Limit: 3), CancellationToken.None);

        result.Count.ShouldBe(3);
    }

    [Theory]
    [InlineData(0, false)]
    [InlineData(1, true)]
    [InlineData(1000, true)]
    [InlineData(1001, false)]
    public void Validator_Should_Bound_Limit(int limit, bool valid)
    {
        var validator = new GetSupplierLookupQueryValidator();

        validator.Validate(new GetSupplierLookupQuery(Limit: limit)).IsValid.ShouldBe(valid);
    }

    [Theory]
    [InlineData(200, true)]
    [InlineData(500, false)]
    [InlineData(1000, false)]
    public void SearchSuppliersValidator_Should_Reject_PageSizes_Above_200(int pageSize, bool valid)
    {
        // Root cause of the empty supplier dropdowns: pickers asked the paged search for 500-2000 rows.
        var validator = new SearchSuppliersQueryValidator();

        validator.Validate(new SearchSuppliersQuery(PageSize: pageSize)).IsValid.ShouldBe(valid);
    }

    public void Dispose() => _db.Dispose();
}

using System.Net;
using FSH.Framework.Core.Exceptions;
using FSH.Modules.Suppliers.Contracts.v1.Suppliers;
using FSH.Modules.Suppliers.Data;
using FSH.Modules.Suppliers.Domain;
using FSH.Modules.Suppliers.Features.v1.Suppliers.RestoreSupplier;
using FSH.Modules.Suppliers.Features.v1.Suppliers.UpdateSupplier;

namespace Suppliers.Tests.Features;

/// <summary>Two live suppliers of a tenant can't share a name (case- and surrounding-space-insensitive).</summary>
public sealed class SupplierNameGuardTests
{
    private readonly SuppliersDbContext _dbContext = SuppliersDbContextFactory.Create();

    private async Task<Supplier> SeedAsync(string name, bool deleted = false)
    {
        var supplier = Supplier.Create(name, null, null, null, null, null, 0m);
        _dbContext.Suppliers.Add(supplier);
        if (deleted)
        {
            _dbContext.Entry(supplier).Property(s => s.IsDeleted).CurrentValue = true;
        }

        await _dbContext.SaveChangesAsync();
        return supplier;
    }

    #region Exception

    [Fact]
    public async Task Update_Should_Conflict_When_Renaming_To_Another_Live_Suppliers_Name()
    {
        await SeedAsync("Himal Pharma");
        var other = await SeedAsync("Nepal Drug House");

        var ex = await Should.ThrowAsync<CustomException>(() => new UpdateSupplierCommandHandler(_dbContext)
            .Handle(new UpdateSupplierCommand(other.Id, " HIMAL pharma"), CancellationToken.None).AsTask());

        ex.StatusCode.ShouldBe(HttpStatusCode.Conflict);
    }

    [Fact]
    public async Task Restore_Should_Conflict_When_A_Live_Supplier_Took_The_Name_Meanwhile()
    {
        var trashed = await SeedAsync("Himal Pharma", deleted: true);
        await SeedAsync("himal pharma");

        var ex = await Should.ThrowAsync<CustomException>(() => new RestoreSupplierCommandHandler(_dbContext)
            .Handle(new RestoreSupplierCommand(trashed.Id), CancellationToken.None).AsTask());

        ex.StatusCode.ShouldBe(HttpStatusCode.Conflict);
    }

    #endregion

    #region Edge Cases

    [Fact]
    public async Task Update_Should_Allow_Keeping_Its_Own_Name()
    {
        var supplier = await SeedAsync("Himal Pharma");

        var id = await new UpdateSupplierCommandHandler(_dbContext)
            .Handle(new UpdateSupplierCommand(supplier.Id, "Himal Pharma", Phone: "9800000001"), CancellationToken.None);

        id.ShouldBe(supplier.Id);
    }

    [Fact]
    public async Task Update_Should_Allow_A_Name_Only_A_Trashed_Supplier_Uses()
    {
        await SeedAsync("Old Traders", deleted: true);
        var supplier = await SeedAsync("Himal Pharma");

        var id = await new UpdateSupplierCommandHandler(_dbContext)
            .Handle(new UpdateSupplierCommand(supplier.Id, "Old Traders"), CancellationToken.None);

        id.ShouldBe(supplier.Id);
    }

    #endregion
}

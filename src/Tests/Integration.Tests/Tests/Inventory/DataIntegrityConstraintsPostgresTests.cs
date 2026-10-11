using Finbuckle.MultiTenant;
using Finbuckle.MultiTenant.Abstractions;
using FSH.Framework.Shared.Multitenancy;
using FSH.Modules.Accounting.Data;
using FSH.Modules.Accounting.Services;
using FSH.Modules.Inventory.Data;
using FSH.Modules.Inventory.Domain;
using FSH.Modules.Multitenancy.Contracts;
using FSH.Modules.Suppliers.Data;
using FSH.Modules.Suppliers.Domain;
using Integration.Tests.Infrastructure;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Npgsql;
using Shouldly;

namespace Integration.Tests.Tests.Inventory;

/// <summary>
/// The HardenDataIntegrity migrations against real PostgreSQL: foreign keys (added NOT VALID, then validated),
/// the guarded unique indexes, the fixed-precision money/quantity columns, and the voucher-number upsert.
/// </summary>
[Collection(FshCollectionDefinition.Name)]
public sealed class DataIntegrityConstraintsPostgresTests
{
    private readonly FshWebApplicationFactory _factory;

    public DataIntegrityConstraintsPostgresTests(FshWebApplicationFactory factory)
    {
        _factory = factory;
    }

    [Theory]
    [InlineData("inventory", "FK_MedicineBatches_Medicines_MedicineId")]
    [InlineData("inventory", "FK_InventoryTransactions_Medicines_MedicineId")]
    [InlineData("sales", "FK_SaleReturns_Sales_SaleId")]
    [InlineData("customers", "FK_CustomerLedgerEntries_Customers_CustomerId")]
    [InlineData("suppliers", "FK_SupplierLedgerEntries_Suppliers_SupplierId")]
    [InlineData("accounting", "FK_VoucherLines_Accounts_AccountId")]
    [InlineData("onboarding", "FK_MigrationLineItems_MigrationSessions_SessionId")]
    [InlineData("prescriptions", "FK_PrescriptionRefills_PrescriptionItems_PrescriptionItemId")]
    public async Task Foreign_Keys_Should_Exist_And_Be_Validated_On_A_Clean_Database(string schema, string constraint)
    {
        using var scope = _factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<InventoryDbContext>();

        var validated = await db.Database.SqlQuery<bool>($"""
            SELECT c.convalidated AS "Value"
            FROM pg_constraint c JOIN pg_namespace n ON n.oid = c.connamespace
            WHERE c.contype = 'f' AND n.nspname = {schema} AND c.conname = {constraint}
            """).ToListAsync();

        validated.ShouldHaveSingleItem().ShouldBeTrue();
    }

    [Theory]
    [InlineData("accounting", "IX_VoucherSequences_TenantId")]
    [InlineData("suppliers", "IX_SupplierLedgerEntries_Document_Unique")]
    [InlineData("suppliers", "IX_Suppliers_TenantId_NormalizedName")]
    public async Task Guarded_Unique_Indexes_Should_Be_Created_On_A_Clean_Database(string schema, string index)
    {
        using var scope = _factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<InventoryDbContext>();

        var count = await db.Database.SqlQuery<int>($"""
            SELECT count(*)::int AS "Value" FROM pg_indexes WHERE schemaname = {schema} AND indexname = {index}
            """).ToListAsync();

        count.ShouldHaveSingleItem().ShouldBe(1);
    }

    [Theory]
    [InlineData("accounting", "Expenses", "Amount", "numeric(18,2)")]
    [InlineData("inventory", "ConsignmentPositions", "QuantityReceived", "numeric(18,3)")]
    [InlineData("inventory", "MedicinePriceHistories", "UnitPrice", "numeric(18,2)")]
    [InlineData("sales", "Sales", "PaymentAmount", "numeric(18,2)")]
    public async Task Money_And_Quantity_Columns_Should_Have_Fixed_Precision(string schema, string table, string column, string expected)
    {
        using var scope = _factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<InventoryDbContext>();

        var types = await db.Database.SqlQuery<string>($"""
            SELECT format_type(a.atttypid, a.atttypmod) AS "Value"
            FROM pg_attribute a
            JOIN pg_class c ON c.oid = a.attrelid
            JOIN pg_namespace n ON n.oid = c.relnamespace
            WHERE n.nspname = {schema} AND c.relname = {table} AND a.attname = {column}
            """).ToListAsync();

        types.ShouldHaveSingleItem().ShouldBe(expected);
    }

    [Fact]
    public async Task The_Unused_Location_Stock_Table_And_Transfer_Location_Columns_Should_Be_Gone()
    {
        using var scope = _factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<InventoryDbContext>();

        var leftovers = await db.Database.SqlQuery<int>($"""
            SELECT (SELECT count(*) FROM information_schema.tables
                    WHERE table_schema = 'inventory' AND table_name = 'MedicineLocationStocks')
                 + (SELECT count(*) FROM information_schema.columns
                    WHERE table_schema = 'inventory' AND table_name = 'StockTransfers'
                      AND column_name IN ('FromLocationId', 'ToLocationId'))
                 AS "Value"
            """).ToListAsync();

        leftovers.ShouldHaveSingleItem().ShouldBe(0);
    }

    [Fact]
    public async Task A_Batch_For_A_Medicine_That_Does_Not_Exist_Should_Be_Rejected()
    {
        using var scope = _factory.Services.CreateScope();
        var tenant = await scope.ServiceProvider.GetRequiredService<IMultiTenantStore<AppTenantInfo>>().GetAsync(TestConstants.RootTenantId);
        scope.ServiceProvider.GetRequiredService<IMultiTenantContextSetter>().MultiTenantContext = new MultiTenantContext<AppTenantInfo>(tenant!);
        var branchId = await scope.ServiceProvider.GetRequiredService<ICurrentBranch>().RequireBranchIdAsync();
        var db = scope.ServiceProvider.GetRequiredService<InventoryDbContext>();

        db.MedicineBatches.Add(MedicineBatch.Create(
            Guid.CreateVersion7(), branchId, $"ORPHAN{Guid.CreateVersion7():N}"[..14],
            DateOnly.FromDateTime(DateTime.UtcNow.AddYears(1)), 5m, 1m, 2m, null));

        var ex = await Should.ThrowAsync<DbUpdateException>(() => db.SaveChangesAsync());
        ex.InnerException.ShouldBeOfType<PostgresException>().SqlState.ShouldBe(PostgresErrorCodes.ForeignKeyViolation);
    }

    [Fact]
    public async Task A_Second_Live_Supplier_With_The_Same_Normalized_Name_Should_Be_Rejected_By_The_Index()
    {
        using var scope = _factory.Services.CreateScope();
        var tenant = await scope.ServiceProvider.GetRequiredService<IMultiTenantStore<AppTenantInfo>>().GetAsync(TestConstants.RootTenantId);
        scope.ServiceProvider.GetRequiredService<IMultiTenantContextSetter>().MultiTenantContext = new MultiTenantContext<AppTenantInfo>(tenant!);
        var db = scope.ServiceProvider.GetRequiredService<SuppliersDbContext>();
        string name = $"Dup {Guid.CreateVersion7():N}"[..20];

        // Bypasses SupplierNameGuard (straight to the DbContext), as two concurrent creates would.
        db.Suppliers.Add(Supplier.Create(name, null, null, null, null, null, 0m));
        await db.SaveChangesAsync();
        db.Suppliers.Add(Supplier.Create($"  {name.ToUpperInvariant()} ", null, null, null, null, null, 0m));

        var ex = await Should.ThrowAsync<DbUpdateException>(() => db.SaveChangesAsync());
        ex.InnerException.ShouldBeOfType<PostgresException>().SqlState.ShouldBe(PostgresErrorCodes.UniqueViolation);
    }

    [Fact]
    public async Task Voucher_Numbers_Should_Start_At_One_For_A_Tenant_Without_A_Sequence_Row()
    {
        using var scope = _factory.Services.CreateScope();
        var tenant = await scope.ServiceProvider.GetRequiredService<IMultiTenantStore<AppTenantInfo>>().GetAsync(TestConstants.RootTenantId);
        scope.ServiceProvider.GetRequiredService<IMultiTenantContextSetter>().MultiTenantContext = new MultiTenantContext<AppTenantInfo>(tenant!);
        var db = scope.ServiceProvider.GetRequiredService<AccountingDbContext>();
        var numbers = scope.ServiceProvider.GetRequiredService<IAccountingVoucherNumbers>();

        // Rolled back, so the shared tenant's real counter is untouched.
        await using var transaction = await db.Database.BeginTransactionAsync();
        await db.Database.ExecuteSqlAsync($"""DELETE FROM accounting."VoucherSequences" WHERE "TenantId" = {tenant!.Id}""");

        int first = await numbers.ReserveNextNumberAsync();
        int second = await numbers.ReserveNextNumberAsync();

        first.ShouldBe(1);
        second.ShouldBe(2);
        await transaction.RollbackAsync();
    }
}

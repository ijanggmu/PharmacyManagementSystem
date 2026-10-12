using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace FSH.Starter.Migrations.PostgreSQL.Suppliers
{
    /// <inheritdoc />
    public partial class HardenDataIntegrity : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateUniqueIndexIfNoDuplicates(
                name: "IX_SupplierLedgerEntries_Document_Unique",
                schema: "suppliers",
                table: "SupplierLedgerEntries",
                columns: new[] { "SupplierId", "ReferenceType", "ReferenceId", "EntryType", "TenantId" },
                unique: true,
                filter: "\"ReferenceId\" IS NOT NULL AND \"EntryType\" IN ('Purchase', 'Return') AND \"ReferenceType\" <> 'MigrationOpeningSupplier'");

            migrationBuilder.AddForeignKeyNotValid(
                name: "FK_SupplierLedgerEntries_Suppliers_SupplierId",
                schema: "suppliers",
                table: "SupplierLedgerEntries",
                column: "SupplierId",
                principalSchema: "suppliers",
                principalTable: "Suppliers",
                principalColumn: "Id",
                onDelete: ReferentialAction.Restrict);

            migrationBuilder.AddForeignKeyNotValid(
                name: "FK_SupplierReturns_Suppliers_SupplierId",
                schema: "suppliers",
                table: "SupplierReturns",
                column: "SupplierId",
                principalSchema: "suppliers",
                principalTable: "Suppliers",
                principalColumn: "Id",
                onDelete: ReferentialAction.Restrict);

            // One live supplier per name per tenant (case- and whitespace-insensitive). EF can't model an
            // expression index, so it lives here; SupplierNameGuard gives the friendly 409 in the app.
            migrationBuilder.CreateUniqueIndexIfNoDuplicatesSql(
                name: "IX_Suppliers_TenantId_NormalizedName",
                schema: "suppliers",
                table: "Suppliers",
                keyExpressions: ["\"TenantId\"", "upper(btrim(\"Name\"))"],
                filter: "NOT \"IsDeleted\"");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.Sql("DROP INDEX IF EXISTS \"suppliers\".\"IX_Suppliers_TenantId_NormalizedName\";");

            migrationBuilder.DropForeignKey(
                name: "FK_SupplierLedgerEntries_Suppliers_SupplierId",
                schema: "suppliers",
                table: "SupplierLedgerEntries");

            migrationBuilder.DropForeignKey(
                name: "FK_SupplierReturns_Suppliers_SupplierId",
                schema: "suppliers",
                table: "SupplierReturns");

            migrationBuilder.Sql("DROP INDEX IF EXISTS \"suppliers\".\"IX_SupplierLedgerEntries_Document_Unique\";");

        }
    }
}

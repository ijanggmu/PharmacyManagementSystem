using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace FSH.Starter.Migrations.PostgreSQL.Customers
{
    /// <inheritdoc />
    public partial class HardenDataIntegrity : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateIndex(
                name: "IX_CustomerLoyaltyEntries_BranchId",
                schema: "customers",
                table: "CustomerLoyaltyEntries",
                column: "BranchId");

            migrationBuilder.CreateUniqueIndexIfNoDuplicates(
                name: "IX_CustomerLoyaltyEntries_SaleId_EntryType_Unique",
                schema: "customers",
                table: "CustomerLoyaltyEntries",
                columns: new[] { "SaleId", "EntryType", "TenantId" },
                unique: true,
                filter: "\"SaleId\" IS NOT NULL AND \"EntryType\" IN ('Earn', 'Redeem')");

            migrationBuilder.CreateUniqueIndexIfNoDuplicates(
                name: "IX_CustomerLedgerEntries_SaleReference_Unique",
                schema: "customers",
                table: "CustomerLedgerEntries",
                columns: new[] { "ReferenceType", "ReferenceId", "TenantId" },
                unique: true,
                filter: "\"EntryType\" = 'Sale' AND \"ReferenceId\" IS NOT NULL");

            migrationBuilder.AddForeignKeyNotValid(
                name: "FK_CustomerLedgerEntries_Customers_CustomerId",
                schema: "customers",
                table: "CustomerLedgerEntries",
                column: "CustomerId",
                principalSchema: "customers",
                principalTable: "Customers",
                principalColumn: "Id",
                onDelete: ReferentialAction.Restrict);

            migrationBuilder.AddForeignKeyNotValid(
                name: "FK_CustomerLoyaltyEntries_Customers_CustomerId",
                schema: "customers",
                table: "CustomerLoyaltyEntries",
                column: "CustomerId",
                principalSchema: "customers",
                principalTable: "Customers",
                principalColumn: "Id",
                onDelete: ReferentialAction.Restrict);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "FK_CustomerLedgerEntries_Customers_CustomerId",
                schema: "customers",
                table: "CustomerLedgerEntries");

            migrationBuilder.DropForeignKey(
                name: "FK_CustomerLoyaltyEntries_Customers_CustomerId",
                schema: "customers",
                table: "CustomerLoyaltyEntries");

            migrationBuilder.DropIndex(
                name: "IX_CustomerLoyaltyEntries_BranchId",
                schema: "customers",
                table: "CustomerLoyaltyEntries");

            migrationBuilder.Sql("DROP INDEX IF EXISTS \"customers\".\"IX_CustomerLoyaltyEntries_SaleId_EntryType_Unique\";");

            migrationBuilder.Sql("DROP INDEX IF EXISTS \"customers\".\"IX_CustomerLedgerEntries_SaleReference_Unique\";");

        }
    }
}

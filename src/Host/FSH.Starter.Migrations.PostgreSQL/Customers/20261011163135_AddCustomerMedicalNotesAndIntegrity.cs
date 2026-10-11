using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace FSH.Starter.Migrations.PostgreSQL.Customers
{
    /// <inheritdoc />
    public partial class AddCustomerMedicalNotesAndIntegrity : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string[]>(
                name: "ChronicConditions",
                schema: "customers",
                table: "Customers",
                type: "text[]",
                nullable: false,
                defaultValueSql: "'{}'");

            migrationBuilder.AddColumn<string[]>(
                name: "CurrentMedications",
                schema: "customers",
                table: "Customers",
                type: "text[]",
                nullable: false,
                defaultValueSql: "'{}'");

            migrationBuilder.AddColumn<uint>(
                name: "xmin",
                schema: "customers",
                table: "Customers",
                type: "xid",
                rowVersion: true,
                nullable: false,
                defaultValue: 0u);

            migrationBuilder.CreateIndex(
                name: "UX_CustomerLoyaltyEntries_Sale_EntryType",
                schema: "customers",
                table: "CustomerLoyaltyEntries",
                columns: new[] { "SaleId", "EntryType", "TenantId" },
                unique: true,
                filter: "\"SaleId\" IS NOT NULL AND \"EntryType\" IN ('Earn', 'Redeem')");

            migrationBuilder.CreateIndex(
                name: "UX_CustomerLedgerEntries_SaleReference",
                schema: "customers",
                table: "CustomerLedgerEntries",
                columns: new[] { "ReferenceType", "ReferenceId", "TenantId" },
                unique: true,
                filter: "\"EntryType\" = 'Sale' AND \"ReferenceId\" IS NOT NULL");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "UX_CustomerLoyaltyEntries_Sale_EntryType",
                schema: "customers",
                table: "CustomerLoyaltyEntries");

            migrationBuilder.DropIndex(
                name: "UX_CustomerLedgerEntries_SaleReference",
                schema: "customers",
                table: "CustomerLedgerEntries");

            migrationBuilder.DropColumn(
                name: "ChronicConditions",
                schema: "customers",
                table: "Customers");

            migrationBuilder.DropColumn(
                name: "CurrentMedications",
                schema: "customers",
                table: "Customers");

            migrationBuilder.DropColumn(
                name: "xmin",
                schema: "customers",
                table: "Customers");
        }
    }
}

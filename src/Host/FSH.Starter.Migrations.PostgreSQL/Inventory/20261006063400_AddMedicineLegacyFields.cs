using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace FSH.Starter.Migrations.PostgreSQL.Inventory
{
    /// <inheritdoc />
    public partial class AddMedicineLegacyFields : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "BrandName",
                schema: "inventory",
                table: "Medicines",
                type: "character varying(200)",
                maxLength: 200,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "Dosage",
                schema: "inventory",
                table: "Medicines",
                type: "character varying(200)",
                maxLength: 200,
                nullable: true);

            migrationBuilder.AddColumn<bool>(
                name: "IsTaxable",
                schema: "inventory",
                table: "Medicines",
                type: "boolean",
                nullable: false,
                defaultValue: true);

            migrationBuilder.AddColumn<bool>(
                name: "RequiresColdChain",
                schema: "inventory",
                table: "Medicines",
                type: "boolean",
                nullable: false,
                defaultValue: false);

            migrationBuilder.AddColumn<string>(
                name: "SideEffects",
                schema: "inventory",
                table: "Medicines",
                type: "character varying(2000)",
                maxLength: 2000,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "StorageInstructions",
                schema: "inventory",
                table: "Medicines",
                type: "character varying(2000)",
                maxLength: 2000,
                nullable: true);

            migrationBuilder.AddColumn<decimal>(
                name: "StorageTempMaxC",
                schema: "inventory",
                table: "Medicines",
                type: "numeric(18,2)",
                precision: 18,
                scale: 2,
                nullable: true);

            migrationBuilder.AddColumn<decimal>(
                name: "StorageTempMinC",
                schema: "inventory",
                table: "Medicines",
                type: "numeric(18,2)",
                precision: 18,
                scale: 2,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "SupplierInvoiceNumber",
                schema: "inventory",
                table: "Medicines",
                type: "character varying(100)",
                maxLength: 100,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "UnitLabel",
                schema: "inventory",
                table: "Medicines",
                type: "character varying(50)",
                maxLength: 50,
                nullable: true);

            migrationBuilder.AddColumn<int>(
                name: "UnitsPerPack",
                schema: "inventory",
                table: "Medicines",
                type: "integer",
                nullable: true);

            migrationBuilder.AddColumn<decimal>(
                name: "VatAmount",
                schema: "inventory",
                table: "Medicines",
                type: "numeric(18,2)",
                precision: 18,
                scale: 2,
                nullable: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "BrandName",
                schema: "inventory",
                table: "Medicines");

            migrationBuilder.DropColumn(
                name: "Dosage",
                schema: "inventory",
                table: "Medicines");

            migrationBuilder.DropColumn(
                name: "IsTaxable",
                schema: "inventory",
                table: "Medicines");

            migrationBuilder.DropColumn(
                name: "RequiresColdChain",
                schema: "inventory",
                table: "Medicines");

            migrationBuilder.DropColumn(
                name: "SideEffects",
                schema: "inventory",
                table: "Medicines");

            migrationBuilder.DropColumn(
                name: "StorageInstructions",
                schema: "inventory",
                table: "Medicines");

            migrationBuilder.DropColumn(
                name: "StorageTempMaxC",
                schema: "inventory",
                table: "Medicines");

            migrationBuilder.DropColumn(
                name: "StorageTempMinC",
                schema: "inventory",
                table: "Medicines");

            migrationBuilder.DropColumn(
                name: "SupplierInvoiceNumber",
                schema: "inventory",
                table: "Medicines");

            migrationBuilder.DropColumn(
                name: "UnitLabel",
                schema: "inventory",
                table: "Medicines");

            migrationBuilder.DropColumn(
                name: "UnitsPerPack",
                schema: "inventory",
                table: "Medicines");

            migrationBuilder.DropColumn(
                name: "VatAmount",
                schema: "inventory",
                table: "Medicines");
        }
    }
}

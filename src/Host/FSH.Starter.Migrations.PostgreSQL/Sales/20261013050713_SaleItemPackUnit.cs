using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace FSH.Starter.Migrations.PostgreSQL.Sales
{
    /// <inheritdoc />
    public partial class SaleItemPackUnit : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "BaseUnitLabel",
                schema: "sales",
                table: "SaleItems",
                type: "character varying(50)",
                maxLength: 50,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "SoldPackLabel",
                schema: "sales",
                table: "SaleItems",
                type: "character varying(50)",
                maxLength: 50,
                nullable: true);

            migrationBuilder.AddColumn<int>(
                name: "SoldUnitsPerPack",
                schema: "sales",
                table: "SaleItems",
                type: "integer",
                nullable: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "BaseUnitLabel",
                schema: "sales",
                table: "SaleItems");

            migrationBuilder.DropColumn(
                name: "SoldPackLabel",
                schema: "sales",
                table: "SaleItems");

            migrationBuilder.DropColumn(
                name: "SoldUnitsPerPack",
                schema: "sales",
                table: "SaleItems");
        }
    }
}

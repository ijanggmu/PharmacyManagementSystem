using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace FSH.Starter.Migrations.PostgreSQL.Inventory
{
    /// <summary>
    /// Third unit level for medicines: box › pack (strip) › base unit. Both columns are nullable — existing
    /// medicines simply have no box. Stock, prices and accounting stay in base units, so no data moves.
    /// </summary>
    public partial class AddMedicineBoxUnit : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "BoxLabel",
                schema: "inventory",
                table: "Medicines",
                type: "character varying(50)",
                maxLength: 50,
                nullable: true);

            migrationBuilder.AddColumn<int>(
                name: "PacksPerBox",
                schema: "inventory",
                table: "Medicines",
                type: "integer",
                nullable: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "BoxLabel",
                schema: "inventory",
                table: "Medicines");

            migrationBuilder.DropColumn(
                name: "PacksPerBox",
                schema: "inventory",
                table: "Medicines");
        }
    }
}

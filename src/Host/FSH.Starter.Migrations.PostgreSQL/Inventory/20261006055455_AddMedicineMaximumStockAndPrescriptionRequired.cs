using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace FSH.Starter.Migrations.PostgreSQL.Inventory
{
    /// <inheritdoc />
    public partial class AddMedicineMaximumStockAndPrescriptionRequired : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<decimal>(
                name: "MaximumStock",
                schema: "inventory",
                table: "Medicines",
                type: "numeric(18,2)",
                precision: 18,
                scale: 2,
                nullable: true);

            migrationBuilder.AddColumn<bool>(
                name: "PrescriptionRequired",
                schema: "inventory",
                table: "Medicines",
                type: "boolean",
                nullable: false,
                defaultValue: false);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "MaximumStock",
                schema: "inventory",
                table: "Medicines");

            migrationBuilder.DropColumn(
                name: "PrescriptionRequired",
                schema: "inventory",
                table: "Medicines");
        }
    }
}

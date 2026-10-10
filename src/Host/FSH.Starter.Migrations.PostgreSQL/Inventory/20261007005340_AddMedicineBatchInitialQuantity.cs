using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace FSH.Starter.Migrations.PostgreSQL.Inventory
{
    /// <inheritdoc />
    public partial class AddMedicineBatchInitialQuantity : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<decimal>(
                name: "InitialQuantity",
                schema: "inventory",
                table: "MedicineBatches",
                type: "numeric(18,3)",
                precision: 18,
                scale: 3,
                nullable: true);

            // Legacy lots have no recorded receipt quantity; use the current on-hand figure as the baseline.
            migrationBuilder.Sql(
                """
                UPDATE inventory."MedicineBatches"
                SET "InitialQuantity" = "QuantityOnHand"
                WHERE "InitialQuantity" IS NULL;
                """);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "InitialQuantity",
                schema: "inventory",
                table: "MedicineBatches");
        }
    }
}

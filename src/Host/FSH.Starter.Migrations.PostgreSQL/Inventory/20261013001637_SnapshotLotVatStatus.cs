using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace FSH.Starter.Migrations.PostgreSQL.Inventory
{
    /// <inheritdoc />
    public partial class SnapshotLotVatStatus : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<bool>(
                name: "IsTaxable",
                schema: "inventory",
                table: "MedicineBatches",
                type: "boolean",
                nullable: false,
                defaultValue: true);

            // Each lot now records the VAT status it was bought under, and a supplier return reverses input VAT
            // from it instead of from the medicine's flag today. Lots already on record take their medicine's
            // current flag, the only record there is of what they were bought under.
            migrationBuilder.Sql("""
                UPDATE inventory."MedicineBatches" AS b
                SET "IsTaxable" = m."IsTaxable"
                FROM inventory."Medicines" AS m
                WHERE b."MedicineId" = m."Id"
                  AND b."IsTaxable" <> m."IsTaxable";
                """);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "IsTaxable",
                schema: "inventory",
                table: "MedicineBatches");
        }
    }
}

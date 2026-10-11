using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace FSH.Starter.Migrations.PostgreSQL.Inventory
{
    /// <inheritdoc />
    public partial class AddUniqueMedicineBarcode : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            // Normalize first so the unique index can be built: blank barcodes become NULL ("no
            // barcode" never collides), and where several live medicines of a tenant share one, the
            // oldest keeps it and the later (likely duplicate) entries lose it.
            migrationBuilder.Sql("""
                UPDATE inventory."Medicines" SET "Barcode" = NULLIF(btrim("Barcode"), '')
                WHERE "Barcode" IS NOT NULL AND "Barcode" IS DISTINCT FROM NULLIF(btrim("Barcode"), '');

                UPDATE inventory."Medicines" m SET "Barcode" = NULL
                FROM (
                    SELECT "Id", row_number() OVER (PARTITION BY "TenantId", "Barcode" ORDER BY "CreatedAtUtc", "Id") AS rn
                    FROM inventory."Medicines"
                    WHERE "Barcode" IS NOT NULL AND "IsDeleted" = FALSE
                ) d
                WHERE m."Id" = d."Id" AND d.rn > 1;
                """);

            migrationBuilder.CreateIndex(
                name: "IX_Medicines_Barcode",
                schema: "inventory",
                table: "Medicines",
                columns: new[] { "Barcode", "TenantId" },
                unique: true,
                filter: "\"Barcode\" IS NOT NULL AND \"IsDeleted\" = FALSE");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "IX_Medicines_Barcode",
                schema: "inventory",
                table: "Medicines");
        }
    }
}

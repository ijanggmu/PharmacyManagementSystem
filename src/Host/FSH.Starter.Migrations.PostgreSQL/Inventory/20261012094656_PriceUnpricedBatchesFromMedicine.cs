using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace FSH.Starter.Migrations.PostgreSQL.Inventory
{
    /// <inheritdoc />
    public partial class PriceUnpricedBatchesFromMedicine : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            // The batch price is now the only selling price, and a sale refuses a batch priced at 0.
            // Older stock paths left some batches at 0, or at cost when the medicine had no price yet.
            // Those batches now take the medicine's price, and a batch with its own price above cost keeps it.
            // This is a data fix only, and the replaced prices are not kept.
            migrationBuilder.Sql("""
                UPDATE inventory."MedicineBatches" AS b
                SET "SellingPrice" = m."UnitPrice", "UpdatedAtUtc" = now()
                FROM inventory."Medicines" AS m
                WHERE b."MedicineId" = m."Id"
                  AND NOT b."IsDisposed"
                  AND m."UnitPrice" > 0
                  AND (b."SellingPrice" <= 0
                       OR (b."SellingPrice" = b."CostPrice" AND m."UnitPrice" > b."CostPrice"));
                """);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            // Data-only repair: the wrong prices it replaced are not kept, so there is nothing to restore.
        }
    }
}

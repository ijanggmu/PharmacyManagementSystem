using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace FSH.Starter.Migrations.PostgreSQL.Inventory
{
    /// <inheritdoc />
    public partial class RepriceBatchesFromMedicinePrice : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            // The batch price is now the only selling price, and a sale refuses a batch priced at 0. Older
            // stock paths left batches at 0 (opening stock, add stock, bulk import with no batch price),
            // at cost (direct goods receipts, onboarding, sale-cancellation restocks), so they sold at the
            // medicine price or at no margin. Those batches take the medicine's price. A batch that was
            // given its own price above cost keeps it. Data only; there is no going back to the old prices.
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

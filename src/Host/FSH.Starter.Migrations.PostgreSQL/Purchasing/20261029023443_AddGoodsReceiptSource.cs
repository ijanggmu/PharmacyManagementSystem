using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace FSH.Starter.Migrations.PostgreSQL.Purchasing
{
    /// <inheritdoc />
    public partial class AddGoodsReceiptSource : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "Source",
                schema: "purchasing",
                table: "DirectGoodsReceipts",
                type: "character varying(16)",
                maxLength: 16,
                nullable: false,
                defaultValue: "SupplierBill");

            // Existing receipts: an order's delivery is linked to it; Add medicine / Bulk import receipts never
            // record their lots (bills and orders do, since lots were recorded on receipts); the rest are bills.
            migrationBuilder.Sql("""
                UPDATE purchasing."DirectGoodsReceipts" r
                SET "Source" = CASE
                    WHEN r."PurchaseOrderId" IS NOT NULL THEN 'PurchaseOrder'
                    WHEN NOT EXISTS (
                        SELECT 1 FROM purchasing."DirectGoodsReceiptLines" l
                        WHERE l."DirectGoodsReceiptId" = r."Id" AND l."BatchId" IS NOT NULL) THEN 'StockEntry'
                    ELSE 'SupplierBill'
                END;
                """);

            migrationBuilder.CreateIndex(
                name: "IX_DirectGoodsReceipts_Source",
                schema: "purchasing",
                table: "DirectGoodsReceipts",
                column: "Source");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "IX_DirectGoodsReceipts_Source",
                schema: "purchasing",
                table: "DirectGoodsReceipts");

            migrationBuilder.DropColumn(
                name: "Source",
                schema: "purchasing",
                table: "DirectGoodsReceipts");
        }
    }
}

using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace FSH.Starter.Migrations.PostgreSQL.Purchasing
{
    /// <inheritdoc />
    public partial class AddPurchaseDiscountsAndFreeGoods : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<decimal>(
                name: "BillDiscountAmount",
                schema: "purchasing",
                table: "PurchaseOrders",
                type: "numeric(18,2)",
                precision: 18,
                scale: 2,
                nullable: false,
                defaultValue: 0m);

            migrationBuilder.AddColumn<decimal>(
                name: "BillDiscountPercent",
                schema: "purchasing",
                table: "PurchaseOrders",
                type: "numeric(9,4)",
                precision: 9,
                scale: 4,
                nullable: false,
                defaultValue: 0m);

            migrationBuilder.AddColumn<decimal>(
                name: "BillDiscountAmount",
                schema: "purchasing",
                table: "PurchaseOrderLines",
                type: "numeric(18,2)",
                precision: 18,
                scale: 2,
                nullable: false,
                defaultValue: 0m);

            migrationBuilder.AddColumn<decimal>(
                name: "DiscountAmount",
                schema: "purchasing",
                table: "PurchaseOrderLines",
                type: "numeric(18,2)",
                precision: 18,
                scale: 2,
                nullable: false,
                defaultValue: 0m);

            migrationBuilder.AddColumn<decimal>(
                name: "DiscountPercent",
                schema: "purchasing",
                table: "PurchaseOrderLines",
                type: "numeric(9,4)",
                precision: 9,
                scale: 4,
                nullable: false,
                defaultValue: 0m);

            migrationBuilder.AddColumn<decimal>(
                name: "FreeQuantity",
                schema: "purchasing",
                table: "PurchaseOrderLines",
                type: "numeric(18,3)",
                precision: 18,
                scale: 3,
                nullable: false,
                defaultValue: 0m);

            migrationBuilder.AddColumn<decimal>(
                name: "PackSize",
                schema: "purchasing",
                table: "PurchaseOrderLines",
                type: "numeric(18,3)",
                precision: 18,
                scale: 3,
                nullable: true);

            migrationBuilder.AddColumn<decimal>(
                name: "PackUnitCost",
                schema: "purchasing",
                table: "PurchaseOrderLines",
                type: "numeric(18,2)",
                precision: 18,
                scale: 2,
                nullable: true);

            migrationBuilder.AddColumn<decimal>(
                name: "BillDiscountAmount",
                schema: "purchasing",
                table: "DirectGoodsReceipts",
                type: "numeric(18,2)",
                precision: 18,
                scale: 2,
                nullable: false,
                defaultValue: 0m);

            migrationBuilder.AddColumn<decimal>(
                name: "BillDiscountPercent",
                schema: "purchasing",
                table: "DirectGoodsReceipts",
                type: "numeric(9,4)",
                precision: 9,
                scale: 4,
                nullable: false,
                defaultValue: 0m);

            migrationBuilder.AddColumn<decimal>(
                name: "BillDiscountAmount",
                schema: "purchasing",
                table: "DirectGoodsReceiptLines",
                type: "numeric(18,2)",
                precision: 18,
                scale: 2,
                nullable: false,
                defaultValue: 0m);

            migrationBuilder.AddColumn<decimal>(
                name: "DiscountAmount",
                schema: "purchasing",
                table: "DirectGoodsReceiptLines",
                type: "numeric(18,2)",
                precision: 18,
                scale: 2,
                nullable: false,
                defaultValue: 0m);

            migrationBuilder.AddColumn<decimal>(
                name: "DiscountPercent",
                schema: "purchasing",
                table: "DirectGoodsReceiptLines",
                type: "numeric(9,4)",
                precision: 9,
                scale: 4,
                nullable: false,
                defaultValue: 0m);

            migrationBuilder.AddColumn<decimal>(
                name: "FreeQuantity",
                schema: "purchasing",
                table: "DirectGoodsReceiptLines",
                type: "numeric(18,3)",
                precision: 18,
                scale: 3,
                nullable: false,
                defaultValue: 0m);

            migrationBuilder.AddColumn<decimal>(
                name: "PackSize",
                schema: "purchasing",
                table: "DirectGoodsReceiptLines",
                type: "numeric(18,3)",
                precision: 18,
                scale: 3,
                nullable: true);

            migrationBuilder.AddColumn<decimal>(
                name: "PackUnitCost",
                schema: "purchasing",
                table: "DirectGoodsReceiptLines",
                type: "numeric(18,2)",
                precision: 18,
                scale: 2,
                nullable: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "BillDiscountAmount",
                schema: "purchasing",
                table: "PurchaseOrders");

            migrationBuilder.DropColumn(
                name: "BillDiscountPercent",
                schema: "purchasing",
                table: "PurchaseOrders");

            migrationBuilder.DropColumn(
                name: "BillDiscountAmount",
                schema: "purchasing",
                table: "PurchaseOrderLines");

            migrationBuilder.DropColumn(
                name: "DiscountAmount",
                schema: "purchasing",
                table: "PurchaseOrderLines");

            migrationBuilder.DropColumn(
                name: "DiscountPercent",
                schema: "purchasing",
                table: "PurchaseOrderLines");

            migrationBuilder.DropColumn(
                name: "FreeQuantity",
                schema: "purchasing",
                table: "PurchaseOrderLines");

            migrationBuilder.DropColumn(
                name: "PackSize",
                schema: "purchasing",
                table: "PurchaseOrderLines");

            migrationBuilder.DropColumn(
                name: "PackUnitCost",
                schema: "purchasing",
                table: "PurchaseOrderLines");

            migrationBuilder.DropColumn(
                name: "BillDiscountAmount",
                schema: "purchasing",
                table: "DirectGoodsReceipts");

            migrationBuilder.DropColumn(
                name: "BillDiscountPercent",
                schema: "purchasing",
                table: "DirectGoodsReceipts");

            migrationBuilder.DropColumn(
                name: "BillDiscountAmount",
                schema: "purchasing",
                table: "DirectGoodsReceiptLines");

            migrationBuilder.DropColumn(
                name: "DiscountAmount",
                schema: "purchasing",
                table: "DirectGoodsReceiptLines");

            migrationBuilder.DropColumn(
                name: "DiscountPercent",
                schema: "purchasing",
                table: "DirectGoodsReceiptLines");

            migrationBuilder.DropColumn(
                name: "FreeQuantity",
                schema: "purchasing",
                table: "DirectGoodsReceiptLines");

            migrationBuilder.DropColumn(
                name: "PackSize",
                schema: "purchasing",
                table: "DirectGoodsReceiptLines");

            migrationBuilder.DropColumn(
                name: "PackUnitCost",
                schema: "purchasing",
                table: "DirectGoodsReceiptLines");
        }
    }
}

using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace FSH.Starter.Migrations.PostgreSQL.Purchasing
{
    /// <inheritdoc />
    public partial class LinkPurchaseOrderToGoodsReceipt : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<Guid>(
                name: "GoodsReceiptId",
                schema: "purchasing",
                table: "PurchaseOrders",
                type: "uuid",
                nullable: true);

            migrationBuilder.AddColumn<Guid>(
                name: "PurchaseOrderId",
                schema: "purchasing",
                table: "DirectGoodsReceipts",
                type: "uuid",
                nullable: true);

            migrationBuilder.CreateIndex(
                name: "IX_PurchaseOrders_GoodsReceiptId",
                schema: "purchasing",
                table: "PurchaseOrders",
                column: "GoodsReceiptId");

            migrationBuilder.CreateIndex(
                name: "IX_DirectGoodsReceipts_PurchaseOrderId",
                schema: "purchasing",
                table: "DirectGoodsReceipts",
                column: "PurchaseOrderId");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "IX_PurchaseOrders_GoodsReceiptId",
                schema: "purchasing",
                table: "PurchaseOrders");

            migrationBuilder.DropIndex(
                name: "IX_DirectGoodsReceipts_PurchaseOrderId",
                schema: "purchasing",
                table: "DirectGoodsReceipts");

            migrationBuilder.DropColumn(
                name: "GoodsReceiptId",
                schema: "purchasing",
                table: "PurchaseOrders");

            migrationBuilder.DropColumn(
                name: "PurchaseOrderId",
                schema: "purchasing",
                table: "DirectGoodsReceipts");
        }
    }
}

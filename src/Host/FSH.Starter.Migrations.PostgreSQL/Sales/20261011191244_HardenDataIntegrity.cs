using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace FSH.Starter.Migrations.PostgreSQL.Sales
{
    /// <inheritdoc />
    public partial class HardenDataIntegrity : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AlterNumericPrecisionIfLossless(
                name: "PaymentAmount",
                schema: "sales",
                table: "Sales",
                precision: 18,
                scale: 2);

            migrationBuilder.AlterNumericPrecisionIfLossless(
                name: "OpeningFloat",
                schema: "sales",
                table: "CashShifts",
                precision: 18,
                scale: 2);

            migrationBuilder.AlterNumericPrecisionIfLossless(
                name: "ClosingCashCounted",
                schema: "sales",
                table: "CashShifts",
                precision: 18,
                scale: 2);

            migrationBuilder.CreateIndex(
                name: "IX_Sales_PrescriptionId",
                schema: "sales",
                table: "Sales",
                column: "PrescriptionId");

            migrationBuilder.AddForeignKeyNotValid(
                name: "FK_IrdInvoiceQueues_Sales_SaleId",
                schema: "sales",
                table: "IrdInvoiceQueues",
                column: "SaleId",
                principalSchema: "sales",
                principalTable: "Sales",
                principalColumn: "Id",
                onDelete: ReferentialAction.Restrict);

            migrationBuilder.AddForeignKeyNotValid(
                name: "FK_RefundPrints_SaleRefunds_RefundId",
                schema: "sales",
                table: "RefundPrints",
                column: "RefundId",
                principalSchema: "sales",
                principalTable: "SaleRefunds",
                principalColumn: "Id",
                onDelete: ReferentialAction.Restrict);

            migrationBuilder.AddForeignKeyNotValid(
                name: "FK_SalePrints_Sales_SaleId",
                schema: "sales",
                table: "SalePrints",
                column: "SaleId",
                principalSchema: "sales",
                principalTable: "Sales",
                principalColumn: "Id",
                onDelete: ReferentialAction.Restrict);

            migrationBuilder.AddForeignKeyNotValid(
                name: "FK_SaleRefundItems_SaleItems_SaleItemId",
                schema: "sales",
                table: "SaleRefundItems",
                column: "SaleItemId",
                principalSchema: "sales",
                principalTable: "SaleItems",
                principalColumn: "Id");

            migrationBuilder.AddForeignKeyNotValid(
                name: "FK_SaleRefunds_Sales_OriginalSaleId",
                schema: "sales",
                table: "SaleRefunds",
                column: "OriginalSaleId",
                principalSchema: "sales",
                principalTable: "Sales",
                principalColumn: "Id",
                onDelete: ReferentialAction.Restrict);

            migrationBuilder.AddForeignKeyNotValid(
                name: "FK_SaleReturnItems_SaleItems_SaleItemId",
                schema: "sales",
                table: "SaleReturnItems",
                column: "SaleItemId",
                principalSchema: "sales",
                principalTable: "SaleItems",
                principalColumn: "Id");

            migrationBuilder.AddForeignKeyNotValid(
                name: "FK_SaleReturns_Sales_SaleId",
                schema: "sales",
                table: "SaleReturns",
                column: "SaleId",
                principalSchema: "sales",
                principalTable: "Sales",
                principalColumn: "Id",
                onDelete: ReferentialAction.Restrict);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "FK_IrdInvoiceQueues_Sales_SaleId",
                schema: "sales",
                table: "IrdInvoiceQueues");

            migrationBuilder.DropForeignKey(
                name: "FK_RefundPrints_SaleRefunds_RefundId",
                schema: "sales",
                table: "RefundPrints");

            migrationBuilder.DropForeignKey(
                name: "FK_SalePrints_Sales_SaleId",
                schema: "sales",
                table: "SalePrints");

            migrationBuilder.DropForeignKey(
                name: "FK_SaleRefundItems_SaleItems_SaleItemId",
                schema: "sales",
                table: "SaleRefundItems");

            migrationBuilder.DropForeignKey(
                name: "FK_SaleRefunds_Sales_OriginalSaleId",
                schema: "sales",
                table: "SaleRefunds");

            migrationBuilder.DropForeignKey(
                name: "FK_SaleReturnItems_SaleItems_SaleItemId",
                schema: "sales",
                table: "SaleReturnItems");

            migrationBuilder.DropForeignKey(
                name: "FK_SaleReturns_Sales_SaleId",
                schema: "sales",
                table: "SaleReturns");

            migrationBuilder.DropIndex(
                name: "IX_Sales_PrescriptionId",
                schema: "sales",
                table: "Sales");

            migrationBuilder.AlterColumn<decimal>(
                name: "PaymentAmount",
                schema: "sales",
                table: "Sales",
                type: "numeric",
                nullable: false,
                oldClrType: typeof(decimal),
                oldType: "numeric(18,2)",
                oldPrecision: 18,
                oldScale: 2);

            migrationBuilder.AlterColumn<decimal>(
                name: "OpeningFloat",
                schema: "sales",
                table: "CashShifts",
                type: "numeric",
                nullable: false,
                oldClrType: typeof(decimal),
                oldType: "numeric(18,2)",
                oldPrecision: 18,
                oldScale: 2);

            migrationBuilder.AlterColumn<decimal>(
                name: "ClosingCashCounted",
                schema: "sales",
                table: "CashShifts",
                type: "numeric",
                nullable: true,
                oldClrType: typeof(decimal),
                oldType: "numeric(18,2)",
                oldPrecision: 18,
                oldScale: 2,
                oldNullable: true);
        }
    }
}

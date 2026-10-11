using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace FSH.Starter.Migrations.PostgreSQL.Sales
{
    /// <inheritdoc />
    public partial class SalesReversalSettlementAndCashFreeze : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<decimal>(
                name: "ExemptAmount",
                schema: "sales",
                table: "SaleReturns",
                type: "numeric(18,2)",
                precision: 18,
                scale: 2,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "RefundMethod",
                schema: "sales",
                table: "SaleReturns",
                type: "character varying(32)",
                maxLength: 32,
                nullable: false,
                defaultValue: "cash");

            migrationBuilder.AddColumn<decimal>(
                name: "SettlementBankAmount",
                schema: "sales",
                table: "SaleReturns",
                type: "numeric(18,2)",
                precision: 18,
                scale: 2,
                nullable: true);

            migrationBuilder.AddColumn<decimal>(
                name: "SettlementCashAmount",
                schema: "sales",
                table: "SaleReturns",
                type: "numeric(18,2)",
                precision: 18,
                scale: 2,
                nullable: true);

            migrationBuilder.AddColumn<decimal>(
                name: "SettlementOnAccountAmount",
                schema: "sales",
                table: "SaleReturns",
                type: "numeric(18,2)",
                precision: 18,
                scale: 2,
                nullable: true);

            migrationBuilder.AddColumn<decimal>(
                name: "TaxableAmount",
                schema: "sales",
                table: "SaleReturns",
                type: "numeric(18,2)",
                precision: 18,
                scale: 2,
                nullable: true);

            migrationBuilder.AddColumn<decimal>(
                name: "VatAmount",
                schema: "sales",
                table: "SaleReturns",
                type: "numeric(18,2)",
                precision: 18,
                scale: 2,
                nullable: true);

            migrationBuilder.AddColumn<decimal>(
                name: "VatRatePercent",
                schema: "sales",
                table: "SaleReturns",
                type: "numeric(5,2)",
                precision: 5,
                scale: 2,
                nullable: true);

            migrationBuilder.AddColumn<decimal>(
                name: "LineAmount",
                schema: "sales",
                table: "SaleReturnItems",
                type: "numeric(18,2)",
                precision: 18,
                scale: 2,
                nullable: true);

            migrationBuilder.AddColumn<decimal>(
                name: "SettlementBankAmount",
                schema: "sales",
                table: "SaleRefunds",
                type: "numeric(18,2)",
                precision: 18,
                scale: 2,
                nullable: true);

            migrationBuilder.AddColumn<decimal>(
                name: "SettlementCashAmount",
                schema: "sales",
                table: "SaleRefunds",
                type: "numeric(18,2)",
                precision: 18,
                scale: 2,
                nullable: true);

            migrationBuilder.AddColumn<decimal>(
                name: "SettlementOnAccountAmount",
                schema: "sales",
                table: "SaleRefunds",
                type: "numeric(18,2)",
                precision: 18,
                scale: 2,
                nullable: true);

            migrationBuilder.AddColumn<decimal>(
                name: "LineAmount",
                schema: "sales",
                table: "SaleRefundItems",
                type: "numeric(18,2)",
                precision: 18,
                scale: 2,
                nullable: true);

            migrationBuilder.AddColumn<decimal>(
                name: "ClosingCashRefundsTotal",
                schema: "sales",
                table: "CashShifts",
                type: "numeric(18,2)",
                precision: 18,
                scale: 2,
                nullable: true);

            migrationBuilder.AddColumn<decimal>(
                name: "ClosingCashSalesTotal",
                schema: "sales",
                table: "CashShifts",
                type: "numeric(18,2)",
                precision: 18,
                scale: 2,
                nullable: true);

            migrationBuilder.AddColumn<decimal>(
                name: "ClosingExpectedCash",
                schema: "sales",
                table: "CashShifts",
                type: "numeric(18,2)",
                precision: 18,
                scale: 2,
                nullable: true);

            migrationBuilder.AddColumn<decimal>(
                name: "ClosingNonCashSalesTotal",
                schema: "sales",
                table: "CashShifts",
                type: "numeric(18,2)",
                precision: 18,
                scale: 2,
                nullable: true);

            migrationBuilder.AddColumn<int>(
                name: "ClosingSalesCount",
                schema: "sales",
                table: "CashShifts",
                type: "integer",
                nullable: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "ExemptAmount",
                schema: "sales",
                table: "SaleReturns");

            migrationBuilder.DropColumn(
                name: "RefundMethod",
                schema: "sales",
                table: "SaleReturns");

            migrationBuilder.DropColumn(
                name: "SettlementBankAmount",
                schema: "sales",
                table: "SaleReturns");

            migrationBuilder.DropColumn(
                name: "SettlementCashAmount",
                schema: "sales",
                table: "SaleReturns");

            migrationBuilder.DropColumn(
                name: "SettlementOnAccountAmount",
                schema: "sales",
                table: "SaleReturns");

            migrationBuilder.DropColumn(
                name: "TaxableAmount",
                schema: "sales",
                table: "SaleReturns");

            migrationBuilder.DropColumn(
                name: "VatAmount",
                schema: "sales",
                table: "SaleReturns");

            migrationBuilder.DropColumn(
                name: "VatRatePercent",
                schema: "sales",
                table: "SaleReturns");

            migrationBuilder.DropColumn(
                name: "LineAmount",
                schema: "sales",
                table: "SaleReturnItems");

            migrationBuilder.DropColumn(
                name: "SettlementBankAmount",
                schema: "sales",
                table: "SaleRefunds");

            migrationBuilder.DropColumn(
                name: "SettlementCashAmount",
                schema: "sales",
                table: "SaleRefunds");

            migrationBuilder.DropColumn(
                name: "SettlementOnAccountAmount",
                schema: "sales",
                table: "SaleRefunds");

            migrationBuilder.DropColumn(
                name: "LineAmount",
                schema: "sales",
                table: "SaleRefundItems");

            migrationBuilder.DropColumn(
                name: "ClosingCashRefundsTotal",
                schema: "sales",
                table: "CashShifts");

            migrationBuilder.DropColumn(
                name: "ClosingCashSalesTotal",
                schema: "sales",
                table: "CashShifts");

            migrationBuilder.DropColumn(
                name: "ClosingExpectedCash",
                schema: "sales",
                table: "CashShifts");

            migrationBuilder.DropColumn(
                name: "ClosingNonCashSalesTotal",
                schema: "sales",
                table: "CashShifts");

            migrationBuilder.DropColumn(
                name: "ClosingSalesCount",
                schema: "sales",
                table: "CashShifts");
        }
    }
}

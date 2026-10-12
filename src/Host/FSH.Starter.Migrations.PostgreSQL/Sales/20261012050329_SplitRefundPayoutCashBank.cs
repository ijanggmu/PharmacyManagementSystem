using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace FSH.Starter.Migrations.PostgreSQL.Sales
{
    /// <inheritdoc />
    public partial class SplitRefundPayoutCashBank : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<decimal>(
                name: "BankPaidOut",
                schema: "sales",
                table: "SaleRefunds",
                type: "numeric(18,2)",
                precision: 18,
                scale: 2,
                nullable: false,
                defaultValue: 0m);

            migrationBuilder.AddColumn<decimal>(
                name: "CashPaidOut",
                schema: "sales",
                table: "SaleRefunds",
                type: "numeric(18,2)",
                precision: 18,
                scale: 2,
                nullable: false,
                defaultValue: 0m);

            migrationBuilder.CreateIndex(
                name: "IX_SaleRefunds_BranchId_AccountingPostedAtUtc",
                schema: "sales",
                table: "SaleRefunds",
                columns: new[] { "BranchId", "AccountingPostedAtUtc" });
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "IX_SaleRefunds_BranchId_AccountingPostedAtUtc",
                schema: "sales",
                table: "SaleRefunds");

            migrationBuilder.DropColumn(
                name: "BankPaidOut",
                schema: "sales",
                table: "SaleRefunds");

            migrationBuilder.DropColumn(
                name: "CashPaidOut",
                schema: "sales",
                table: "SaleRefunds");
        }
    }
}

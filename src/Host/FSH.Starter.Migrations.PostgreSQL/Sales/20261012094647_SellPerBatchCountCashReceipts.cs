using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace FSH.Starter.Migrations.PostgreSQL.Sales
{
    /// <inheritdoc />
    public partial class SellPerBatchCountCashReceipts : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<Guid>(
                name: "BatchId",
                schema: "sales",
                table: "SaleItems",
                type: "uuid",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "BatchNo",
                schema: "sales",
                table: "SaleItems",
                type: "character varying(100)",
                maxLength: 100,
                nullable: true);

            migrationBuilder.AddColumn<decimal>(
                name: "ClosingCashReceiptsTotal",
                schema: "sales",
                table: "CashShifts",
                type: "numeric(18,2)",
                precision: 18,
                scale: 2,
                nullable: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "BatchId",
                schema: "sales",
                table: "SaleItems");

            migrationBuilder.DropColumn(
                name: "BatchNo",
                schema: "sales",
                table: "SaleItems");

            migrationBuilder.DropColumn(
                name: "ClosingCashReceiptsTotal",
                schema: "sales",
                table: "CashShifts");
        }
    }
}

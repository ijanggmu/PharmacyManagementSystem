using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace FSH.Starter.Migrations.PostgreSQL.Sales
{
    /// <inheritdoc />
    public partial class AddBranchIdToSales : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<Guid>(
                name: "BranchId",
                schema: "sales",
                table: "Sales",
                type: "uuid",
                nullable: false,
                defaultValue: Guid.Empty);

            migrationBuilder.AddColumn<Guid>(
                name: "BranchId",
                schema: "sales",
                table: "SaleReturns",
                type: "uuid",
                nullable: false,
                defaultValue: Guid.Empty);

            migrationBuilder.AddColumn<Guid>(
                name: "BranchId",
                schema: "sales",
                table: "SaleRefunds",
                type: "uuid",
                nullable: false,
                defaultValue: Guid.Empty);

            migrationBuilder.AddColumn<Guid>(
                name: "BranchId",
                schema: "sales",
                table: "SaleItems",
                type: "uuid",
                nullable: false,
                defaultValue: Guid.Empty);

            migrationBuilder.AddColumn<Guid>(
                name: "BranchId",
                schema: "sales",
                table: "CashShifts",
                type: "uuid",
                nullable: false,
                defaultValue: Guid.Empty);

            migrationBuilder.CreateIndex(
                name: "IX_Sales_BranchId",
                schema: "sales",
                table: "Sales",
                column: "BranchId");

            migrationBuilder.CreateIndex(
                name: "IX_SaleReturns_BranchId",
                schema: "sales",
                table: "SaleReturns",
                column: "BranchId");

            migrationBuilder.CreateIndex(
                name: "IX_SaleRefunds_BranchId",
                schema: "sales",
                table: "SaleRefunds",
                column: "BranchId");

            migrationBuilder.CreateIndex(
                name: "IX_SaleItems_BranchId",
                schema: "sales",
                table: "SaleItems",
                column: "BranchId");

            migrationBuilder.CreateIndex(
                name: "IX_CashShifts_BranchId",
                schema: "sales",
                table: "CashShifts",
                column: "BranchId");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "IX_Sales_BranchId",
                schema: "sales",
                table: "Sales");

            migrationBuilder.DropIndex(
                name: "IX_SaleReturns_BranchId",
                schema: "sales",
                table: "SaleReturns");

            migrationBuilder.DropIndex(
                name: "IX_SaleRefunds_BranchId",
                schema: "sales",
                table: "SaleRefunds");

            migrationBuilder.DropIndex(
                name: "IX_SaleItems_BranchId",
                schema: "sales",
                table: "SaleItems");

            migrationBuilder.DropIndex(
                name: "IX_CashShifts_BranchId",
                schema: "sales",
                table: "CashShifts");

            migrationBuilder.DropColumn(
                name: "BranchId",
                schema: "sales",
                table: "Sales");

            migrationBuilder.DropColumn(
                name: "BranchId",
                schema: "sales",
                table: "SaleReturns");

            migrationBuilder.DropColumn(
                name: "BranchId",
                schema: "sales",
                table: "SaleRefunds");

            migrationBuilder.DropColumn(
                name: "BranchId",
                schema: "sales",
                table: "SaleItems");

            migrationBuilder.DropColumn(
                name: "BranchId",
                schema: "sales",
                table: "CashShifts");
        }
    }
}

using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace FSH.Starter.Migrations.PostgreSQL.Sales
{
    /// <inheritdoc />
    public partial class ReturnsPayOutThroughRefunds : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AlterColumn<decimal>(
                name: "UnitPrice",
                schema: "sales",
                table: "SaleReturnItems",
                type: "numeric(18,4)",
                precision: 18,
                scale: 4,
                nullable: false,
                oldClrType: typeof(decimal),
                oldType: "numeric(18,2)",
                oldPrecision: 18,
                oldScale: 2);

            migrationBuilder.AddColumn<Guid>(
                name: "BatchId",
                schema: "sales",
                table: "SaleReturnItems",
                type: "uuid",
                nullable: true);

            migrationBuilder.AddColumn<Guid>(
                name: "ReturnId",
                schema: "sales",
                table: "SaleRefunds",
                type: "uuid",
                nullable: true);

            migrationBuilder.AlterColumn<decimal>(
                name: "UnitPrice",
                schema: "sales",
                table: "SaleRefundItems",
                type: "numeric(18,4)",
                precision: 18,
                scale: 4,
                nullable: false,
                oldClrType: typeof(decimal),
                oldType: "numeric(18,2)",
                oldPrecision: 18,
                oldScale: 2);

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
                type: "character varying(64)",
                maxLength: 64,
                nullable: true);

            migrationBuilder.CreateIndex(
                name: "IX_SaleRefunds_ReturnId",
                schema: "sales",
                table: "SaleRefunds",
                columns: new[] { "ReturnId", "TenantId" },
                unique: true,
                filter: "\"ReturnId\" IS NOT NULL");

            migrationBuilder.AddForeignKey(
                name: "FK_SaleRefunds_SaleReturns_ReturnId",
                schema: "sales",
                table: "SaleRefunds",
                column: "ReturnId",
                principalSchema: "sales",
                principalTable: "SaleReturns",
                principalColumn: "Id",
                onDelete: ReferentialAction.Restrict);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "FK_SaleRefunds_SaleReturns_ReturnId",
                schema: "sales",
                table: "SaleRefunds");

            migrationBuilder.DropIndex(
                name: "IX_SaleRefunds_ReturnId",
                schema: "sales",
                table: "SaleRefunds");

            migrationBuilder.DropColumn(
                name: "BatchId",
                schema: "sales",
                table: "SaleReturnItems");

            migrationBuilder.DropColumn(
                name: "ReturnId",
                schema: "sales",
                table: "SaleRefunds");

            migrationBuilder.DropColumn(
                name: "BatchId",
                schema: "sales",
                table: "SaleItems");

            migrationBuilder.DropColumn(
                name: "BatchNo",
                schema: "sales",
                table: "SaleItems");

            migrationBuilder.AlterColumn<decimal>(
                name: "UnitPrice",
                schema: "sales",
                table: "SaleReturnItems",
                type: "numeric(18,2)",
                precision: 18,
                scale: 2,
                nullable: false,
                oldClrType: typeof(decimal),
                oldType: "numeric(18,4)",
                oldPrecision: 18,
                oldScale: 4);

            migrationBuilder.AlterColumn<decimal>(
                name: "UnitPrice",
                schema: "sales",
                table: "SaleRefundItems",
                type: "numeric(18,2)",
                precision: 18,
                scale: 2,
                nullable: false,
                oldClrType: typeof(decimal),
                oldType: "numeric(18,4)",
                oldPrecision: 18,
                oldScale: 4);
        }
    }
}

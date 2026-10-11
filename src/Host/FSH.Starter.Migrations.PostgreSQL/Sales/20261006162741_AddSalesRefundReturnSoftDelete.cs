using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace FSH.Starter.Migrations.PostgreSQL.Sales
{
    /// <inheritdoc />
    public partial class AddSalesRefundReturnSoftDelete : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "DeletedBy",
                schema: "sales",
                table: "SaleReturns",
                type: "text",
                nullable: true);

            migrationBuilder.AddColumn<DateTimeOffset>(
                name: "DeletedOnUtc",
                schema: "sales",
                table: "SaleReturns",
                type: "timestamp with time zone",
                nullable: true);

            migrationBuilder.AddColumn<bool>(
                name: "IsDeleted",
                schema: "sales",
                table: "SaleReturns",
                type: "boolean",
                nullable: false,
                defaultValue: false);

            migrationBuilder.AddColumn<string>(
                name: "DeletedBy",
                schema: "sales",
                table: "SaleRefunds",
                type: "text",
                nullable: true);

            migrationBuilder.AddColumn<DateTimeOffset>(
                name: "DeletedOnUtc",
                schema: "sales",
                table: "SaleRefunds",
                type: "timestamp with time zone",
                nullable: true);

            migrationBuilder.AddColumn<bool>(
                name: "IsDeleted",
                schema: "sales",
                table: "SaleRefunds",
                type: "boolean",
                nullable: false,
                defaultValue: false);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "DeletedBy",
                schema: "sales",
                table: "SaleReturns");

            migrationBuilder.DropColumn(
                name: "DeletedOnUtc",
                schema: "sales",
                table: "SaleReturns");

            migrationBuilder.DropColumn(
                name: "IsDeleted",
                schema: "sales",
                table: "SaleReturns");

            migrationBuilder.DropColumn(
                name: "DeletedBy",
                schema: "sales",
                table: "SaleRefunds");

            migrationBuilder.DropColumn(
                name: "DeletedOnUtc",
                schema: "sales",
                table: "SaleRefunds");

            migrationBuilder.DropColumn(
                name: "IsDeleted",
                schema: "sales",
                table: "SaleRefunds");
        }
    }
}

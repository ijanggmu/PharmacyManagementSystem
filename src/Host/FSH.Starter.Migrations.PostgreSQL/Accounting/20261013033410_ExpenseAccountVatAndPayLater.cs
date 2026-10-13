using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace FSH.Starter.Migrations.PostgreSQL.Accounting
{
    /// <inheritdoc />
    public partial class ExpenseAccountVatAndPayLater : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<Guid>(
                name: "ExpenseAccountId",
                schema: "accounting",
                table: "Expenses",
                type: "uuid",
                nullable: true);

            migrationBuilder.AddColumn<Guid>(
                name: "SupplierId",
                schema: "accounting",
                table: "Expenses",
                type: "uuid",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "SupplierVatNumber",
                schema: "accounting",
                table: "Expenses",
                type: "character varying(32)",
                maxLength: 32,
                nullable: true);

            migrationBuilder.AddColumn<decimal>(
                name: "VatAmount",
                schema: "accounting",
                table: "Expenses",
                type: "numeric(18,2)",
                precision: 18,
                scale: 2,
                nullable: false,
                defaultValue: 0m);

            migrationBuilder.AddColumn<string>(
                name: "VendorName",
                schema: "accounting",
                table: "Expenses",
                type: "character varying(256)",
                maxLength: 256,
                nullable: true);

            migrationBuilder.CreateIndex(
                name: "IX_Expenses_SupplierId",
                schema: "accounting",
                table: "Expenses",
                column: "SupplierId");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "IX_Expenses_SupplierId",
                schema: "accounting",
                table: "Expenses");

            migrationBuilder.DropColumn(
                name: "ExpenseAccountId",
                schema: "accounting",
                table: "Expenses");

            migrationBuilder.DropColumn(
                name: "SupplierId",
                schema: "accounting",
                table: "Expenses");

            migrationBuilder.DropColumn(
                name: "SupplierVatNumber",
                schema: "accounting",
                table: "Expenses");

            migrationBuilder.DropColumn(
                name: "VatAmount",
                schema: "accounting",
                table: "Expenses");

            migrationBuilder.DropColumn(
                name: "VendorName",
                schema: "accounting",
                table: "Expenses");
        }
    }
}

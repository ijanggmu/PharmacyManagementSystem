using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace FSH.Starter.Migrations.PostgreSQL.Sales
{
    /// <inheritdoc />
    public partial class AddInvoiceNumberingVatAndPrints : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "IX_Sales_InvoiceNumber",
                schema: "sales",
                table: "Sales");

            migrationBuilder.AddColumn<decimal>(
                name: "ExemptAmount",
                schema: "sales",
                table: "Sales",
                type: "numeric(18,2)",
                precision: 18,
                scale: 2,
                nullable: true);

            migrationBuilder.AddColumn<int>(
                name: "FiscalYear",
                schema: "sales",
                table: "Sales",
                type: "integer",
                nullable: true);

            migrationBuilder.AddColumn<decimal>(
                name: "TaxableAmount",
                schema: "sales",
                table: "Sales",
                type: "numeric(18,2)",
                precision: 18,
                scale: 2,
                nullable: true);

            migrationBuilder.AddColumn<decimal>(
                name: "VatAmount",
                schema: "sales",
                table: "Sales",
                type: "numeric(18,2)",
                precision: 18,
                scale: 2,
                nullable: true);

            migrationBuilder.AddColumn<decimal>(
                name: "VatRatePercent",
                schema: "sales",
                table: "Sales",
                type: "numeric(5,2)",
                precision: 5,
                scale: 2,
                nullable: true);

            migrationBuilder.AddColumn<bool>(
                name: "IsTaxable",
                schema: "sales",
                table: "SaleItems",
                type: "boolean",
                nullable: false,
                defaultValue: true);

            migrationBuilder.CreateTable(
                name: "InvoiceNumberSequences",
                schema: "sales",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    BranchId = table.Column<Guid>(type: "uuid", nullable: false),
                    FiscalYear = table.Column<int>(type: "integer", nullable: false),
                    LastNumber = table.Column<int>(type: "integer", nullable: false),
                    TenantId = table.Column<string>(type: "text", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_InvoiceNumberSequences", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "SalePrints",
                schema: "sales",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    SaleId = table.Column<Guid>(type: "uuid", nullable: false),
                    BranchId = table.Column<Guid>(type: "uuid", nullable: false),
                    PrintNumber = table.Column<int>(type: "integer", nullable: false),
                    Format = table.Column<string>(type: "character varying(32)", maxLength: 32, nullable: false),
                    PrintedByUserId = table.Column<Guid>(type: "uuid", nullable: true),
                    PrintedAtUtc = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    TenantId = table.Column<string>(type: "text", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_SalePrints", x => x.Id);
                });

            migrationBuilder.CreateIndex(
                name: "IX_Sales_BranchId_FiscalYear",
                schema: "sales",
                table: "Sales",
                columns: new[] { "BranchId", "FiscalYear" });

            migrationBuilder.CreateIndex(
                name: "IX_Sales_TenantId_InvoiceNumber",
                schema: "sales",
                table: "Sales",
                columns: new[] { "TenantId", "InvoiceNumber" },
                unique: true,
                filter: "\"InvoiceNumber\" IS NOT NULL");

            migrationBuilder.CreateIndex(
                name: "IX_InvoiceNumberSequences_TenantId_BranchId_FiscalYear",
                schema: "sales",
                table: "InvoiceNumberSequences",
                columns: new[] { "TenantId", "BranchId", "FiscalYear" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_SalePrints_BranchId",
                schema: "sales",
                table: "SalePrints",
                column: "BranchId");

            migrationBuilder.CreateIndex(
                name: "IX_SalePrints_SaleId_PrintNumber",
                schema: "sales",
                table: "SalePrints",
                columns: new[] { "SaleId", "PrintNumber", "TenantId" },
                unique: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "InvoiceNumberSequences",
                schema: "sales");

            migrationBuilder.DropTable(
                name: "SalePrints",
                schema: "sales");

            migrationBuilder.DropIndex(
                name: "IX_Sales_BranchId_FiscalYear",
                schema: "sales",
                table: "Sales");

            migrationBuilder.DropIndex(
                name: "IX_Sales_TenantId_InvoiceNumber",
                schema: "sales",
                table: "Sales");

            migrationBuilder.DropColumn(
                name: "ExemptAmount",
                schema: "sales",
                table: "Sales");

            migrationBuilder.DropColumn(
                name: "FiscalYear",
                schema: "sales",
                table: "Sales");

            migrationBuilder.DropColumn(
                name: "TaxableAmount",
                schema: "sales",
                table: "Sales");

            migrationBuilder.DropColumn(
                name: "VatAmount",
                schema: "sales",
                table: "Sales");

            migrationBuilder.DropColumn(
                name: "VatRatePercent",
                schema: "sales",
                table: "Sales");

            migrationBuilder.DropColumn(
                name: "IsTaxable",
                schema: "sales",
                table: "SaleItems");

            migrationBuilder.CreateIndex(
                name: "IX_Sales_InvoiceNumber",
                schema: "sales",
                table: "Sales",
                columns: new[] { "InvoiceNumber", "TenantId" },
                unique: true,
                filter: "\"InvoiceNumber\" IS NOT NULL");
        }
    }
}

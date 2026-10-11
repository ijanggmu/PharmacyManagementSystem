using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace FSH.Starter.Migrations.PostgreSQL.Sales
{
    /// <inheritdoc />
    public partial class AddCreditNoteNumberingAndPrints : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "IX_InvoiceNumberSequences_TenantId_BranchId_FiscalYear",
                schema: "sales",
                table: "InvoiceNumberSequences");

            migrationBuilder.AddColumn<decimal>(
                name: "ExemptAmount",
                schema: "sales",
                table: "SaleRefunds",
                type: "numeric(18,2)",
                precision: 18,
                scale: 2,
                nullable: true);

            migrationBuilder.AddColumn<int>(
                name: "FiscalYear",
                schema: "sales",
                table: "SaleRefunds",
                type: "integer",
                nullable: true);

            migrationBuilder.AddColumn<decimal>(
                name: "TaxableAmount",
                schema: "sales",
                table: "SaleRefunds",
                type: "numeric(18,2)",
                precision: 18,
                scale: 2,
                nullable: true);

            migrationBuilder.AddColumn<decimal>(
                name: "VatAmount",
                schema: "sales",
                table: "SaleRefunds",
                type: "numeric(18,2)",
                precision: 18,
                scale: 2,
                nullable: true);

            migrationBuilder.AddColumn<decimal>(
                name: "VatRatePercent",
                schema: "sales",
                table: "SaleRefunds",
                type: "numeric(5,2)",
                precision: 5,
                scale: 2,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "Series",
                schema: "sales",
                table: "InvoiceNumberSequences",
                type: "character varying(8)",
                maxLength: 8,
                nullable: false,
                defaultValue: "INV");

            migrationBuilder.CreateTable(
                name: "RefundPrints",
                schema: "sales",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    RefundId = table.Column<Guid>(type: "uuid", nullable: false),
                    BranchId = table.Column<Guid>(type: "uuid", nullable: false),
                    PrintNumber = table.Column<int>(type: "integer", nullable: false),
                    Format = table.Column<string>(type: "character varying(32)", maxLength: 32, nullable: false),
                    PrintedByUserId = table.Column<Guid>(type: "uuid", nullable: true),
                    PrintedAtUtc = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    TenantId = table.Column<string>(type: "text", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_RefundPrints", x => x.Id);
                });

            migrationBuilder.CreateIndex(
                name: "IX_InvoiceNumberSequences_TenantId_BranchId_Series_FiscalYear",
                schema: "sales",
                table: "InvoiceNumberSequences",
                columns: new[] { "TenantId", "BranchId", "Series", "FiscalYear" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_RefundPrints_BranchId",
                schema: "sales",
                table: "RefundPrints",
                column: "BranchId");

            migrationBuilder.CreateIndex(
                name: "IX_RefundPrints_RefundId_PrintNumber",
                schema: "sales",
                table: "RefundPrints",
                columns: new[] { "RefundId", "PrintNumber", "TenantId" },
                unique: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "RefundPrints",
                schema: "sales");

            migrationBuilder.DropIndex(
                name: "IX_InvoiceNumberSequences_TenantId_BranchId_Series_FiscalYear",
                schema: "sales",
                table: "InvoiceNumberSequences");

            migrationBuilder.DropColumn(
                name: "ExemptAmount",
                schema: "sales",
                table: "SaleRefunds");

            migrationBuilder.DropColumn(
                name: "FiscalYear",
                schema: "sales",
                table: "SaleRefunds");

            migrationBuilder.DropColumn(
                name: "TaxableAmount",
                schema: "sales",
                table: "SaleRefunds");

            migrationBuilder.DropColumn(
                name: "VatAmount",
                schema: "sales",
                table: "SaleRefunds");

            migrationBuilder.DropColumn(
                name: "VatRatePercent",
                schema: "sales",
                table: "SaleRefunds");

            migrationBuilder.DropColumn(
                name: "Series",
                schema: "sales",
                table: "InvoiceNumberSequences");

            migrationBuilder.CreateIndex(
                name: "IX_InvoiceNumberSequences_TenantId_BranchId_FiscalYear",
                schema: "sales",
                table: "InvoiceNumberSequences",
                columns: new[] { "TenantId", "BranchId", "FiscalYear" },
                unique: true);
        }
    }
}

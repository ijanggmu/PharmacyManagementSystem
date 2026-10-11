using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace FSH.Starter.Migrations.PostgreSQL.Suppliers
{
    /// <inheritdoc />
    public partial class AddDebitNotes : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "DocumentNumber",
                schema: "suppliers",
                table: "SupplierReturns",
                type: "character varying(64)",
                maxLength: 64,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "SupplierInvoiceNumber",
                schema: "suppliers",
                table: "SupplierReturns",
                type: "character varying(100)",
                maxLength: 100,
                nullable: true);

            migrationBuilder.AddColumn<Guid>(
                name: "BatchId",
                schema: "suppliers",
                table: "SupplierReturnItems",
                type: "uuid",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "BatchNo",
                schema: "suppliers",
                table: "SupplierReturnItems",
                type: "character varying(64)",
                maxLength: 64,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "MedicineName",
                schema: "suppliers",
                table: "SupplierReturnItems",
                type: "character varying(256)",
                maxLength: 256,
                nullable: true);

            migrationBuilder.AddColumn<decimal>(
                name: "VatAmount",
                schema: "suppliers",
                table: "SupplierReturnItems",
                type: "numeric(18,2)",
                precision: 18,
                scale: 2,
                nullable: false,
                defaultValue: 0m);

            migrationBuilder.CreateTable(
                name: "NumberSequences",
                schema: "suppliers",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    BranchId = table.Column<Guid>(type: "uuid", nullable: false),
                    Series = table.Column<string>(type: "character varying(8)", maxLength: 8, nullable: false),
                    FiscalYear = table.Column<int>(type: "integer", nullable: false),
                    LastNumber = table.Column<int>(type: "integer", nullable: false),
                    TenantId = table.Column<string>(type: "text", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_NumberSequences", x => x.Id);
                });

            migrationBuilder.CreateIndex(
                name: "IX_SupplierReturns_DocumentNumber",
                schema: "suppliers",
                table: "SupplierReturns",
                column: "DocumentNumber");

            migrationBuilder.CreateIndex(
                name: "IX_NumberSequences_TenantId_BranchId_Series_FiscalYear",
                schema: "suppliers",
                table: "NumberSequences",
                columns: new[] { "TenantId", "BranchId", "Series", "FiscalYear" },
                unique: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "NumberSequences",
                schema: "suppliers");

            migrationBuilder.DropIndex(
                name: "IX_SupplierReturns_DocumentNumber",
                schema: "suppliers",
                table: "SupplierReturns");

            migrationBuilder.DropColumn(
                name: "DocumentNumber",
                schema: "suppliers",
                table: "SupplierReturns");

            migrationBuilder.DropColumn(
                name: "SupplierInvoiceNumber",
                schema: "suppliers",
                table: "SupplierReturns");

            migrationBuilder.DropColumn(
                name: "BatchId",
                schema: "suppliers",
                table: "SupplierReturnItems");

            migrationBuilder.DropColumn(
                name: "BatchNo",
                schema: "suppliers",
                table: "SupplierReturnItems");

            migrationBuilder.DropColumn(
                name: "MedicineName",
                schema: "suppliers",
                table: "SupplierReturnItems");

            migrationBuilder.DropColumn(
                name: "VatAmount",
                schema: "suppliers",
                table: "SupplierReturnItems");
        }
    }
}

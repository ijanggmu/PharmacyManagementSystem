using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace FSH.Starter.Migrations.PostgreSQL.Purchasing
{
    /// <inheritdoc />
    public partial class AddDirectGoodsReceiptNumbering : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<int>(
                name: "FiscalYear",
                schema: "purchasing",
                table: "DirectGoodsReceipts",
                type: "integer",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "ReceiptNumber",
                schema: "purchasing",
                table: "DirectGoodsReceipts",
                type: "character varying(64)",
                maxLength: 64,
                nullable: true);

            migrationBuilder.CreateTable(
                name: "NumberSequences",
                schema: "purchasing",
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
                name: "IX_DirectGoodsReceipts_BranchId_FiscalYear",
                schema: "purchasing",
                table: "DirectGoodsReceipts",
                columns: new[] { "BranchId", "FiscalYear" });

            migrationBuilder.CreateIndex(
                name: "IX_DirectGoodsReceipts_TenantId_ReceiptNumber",
                schema: "purchasing",
                table: "DirectGoodsReceipts",
                columns: new[] { "TenantId", "ReceiptNumber" },
                unique: true,
                filter: "\"ReceiptNumber\" IS NOT NULL");

            migrationBuilder.CreateIndex(
                name: "IX_NumberSequences_TenantId_BranchId_Series_FiscalYear",
                schema: "purchasing",
                table: "NumberSequences",
                columns: new[] { "TenantId", "BranchId", "Series", "FiscalYear" },
                unique: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "NumberSequences",
                schema: "purchasing");

            migrationBuilder.DropIndex(
                name: "IX_DirectGoodsReceipts_BranchId_FiscalYear",
                schema: "purchasing",
                table: "DirectGoodsReceipts");

            migrationBuilder.DropIndex(
                name: "IX_DirectGoodsReceipts_TenantId_ReceiptNumber",
                schema: "purchasing",
                table: "DirectGoodsReceipts");

            migrationBuilder.DropColumn(
                name: "FiscalYear",
                schema: "purchasing",
                table: "DirectGoodsReceipts");

            migrationBuilder.DropColumn(
                name: "ReceiptNumber",
                schema: "purchasing",
                table: "DirectGoodsReceipts");
        }
    }
}

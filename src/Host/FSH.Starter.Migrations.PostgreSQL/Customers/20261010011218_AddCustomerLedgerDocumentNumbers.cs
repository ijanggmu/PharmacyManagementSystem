using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace FSH.Starter.Migrations.PostgreSQL.Customers
{
    /// <inheritdoc />
    public partial class AddCustomerLedgerDocumentNumbers : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "DocumentNumber",
                schema: "customers",
                table: "CustomerLedgerEntries",
                type: "character varying(64)",
                maxLength: 64,
                nullable: true);

            migrationBuilder.CreateTable(
                name: "NumberSequences",
                schema: "customers",
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
                name: "IX_NumberSequences_TenantId_BranchId_Series_FiscalYear",
                schema: "customers",
                table: "NumberSequences",
                columns: new[] { "TenantId", "BranchId", "Series", "FiscalYear" },
                unique: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "NumberSequences",
                schema: "customers");

            migrationBuilder.DropColumn(
                name: "DocumentNumber",
                schema: "customers",
                table: "CustomerLedgerEntries");
        }
    }
}

using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace FSH.Starter.Migrations.PostgreSQL.Suppliers
{
    /// <inheritdoc />
    public partial class AddBranchIdToSupplierLedgerAndReturns : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<Guid>(
                name: "BranchId",
                schema: "suppliers",
                table: "SupplierLedgerEntries",
                type: "uuid",
                nullable: true);

            migrationBuilder.CreateTable(
                name: "SupplierReturns",
                schema: "suppliers",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    SupplierId = table.Column<Guid>(type: "uuid", nullable: false),
                    ReturnDateUtc = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    Notes = table.Column<string>(type: "character varying(1024)", maxLength: 1024, nullable: true),
                    CreatedAtUtc = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    BranchId = table.Column<Guid>(type: "uuid", nullable: true),
                    TenantId = table.Column<string>(type: "text", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_SupplierReturns", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "SupplierReturnItems",
                schema: "suppliers",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    SupplierReturnId = table.Column<Guid>(type: "uuid", nullable: false),
                    MedicineId = table.Column<Guid>(type: "uuid", nullable: false),
                    Quantity = table.Column<decimal>(type: "numeric(18,3)", precision: 18, scale: 3, nullable: false),
                    UnitCost = table.Column<decimal>(type: "numeric(18,2)", precision: 18, scale: 2, nullable: false),
                    ReturnReason = table.Column<string>(type: "character varying(256)", maxLength: 256, nullable: false),
                    Notes = table.Column<string>(type: "character varying(1024)", maxLength: 1024, nullable: true),
                    TenantId = table.Column<string>(type: "text", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_SupplierReturnItems", x => x.Id);
                    table.ForeignKey(
                        name: "FK_SupplierReturnItems_SupplierReturns_SupplierReturnId",
                        column: x => x.SupplierReturnId,
                        principalSchema: "suppliers",
                        principalTable: "SupplierReturns",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "IX_SupplierLedgerEntries_BranchId",
                schema: "suppliers",
                table: "SupplierLedgerEntries",
                column: "BranchId");

            migrationBuilder.CreateIndex(
                name: "IX_SupplierReturnItems_MedicineId",
                schema: "suppliers",
                table: "SupplierReturnItems",
                column: "MedicineId");

            migrationBuilder.CreateIndex(
                name: "IX_SupplierReturnItems_SupplierReturnId",
                schema: "suppliers",
                table: "SupplierReturnItems",
                column: "SupplierReturnId");

            migrationBuilder.CreateIndex(
                name: "IX_SupplierReturns_BranchId",
                schema: "suppliers",
                table: "SupplierReturns",
                column: "BranchId");

            migrationBuilder.CreateIndex(
                name: "IX_SupplierReturns_ReturnDateUtc",
                schema: "suppliers",
                table: "SupplierReturns",
                column: "ReturnDateUtc");

            migrationBuilder.CreateIndex(
                name: "IX_SupplierReturns_SupplierId",
                schema: "suppliers",
                table: "SupplierReturns",
                column: "SupplierId");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "SupplierReturnItems",
                schema: "suppliers");

            migrationBuilder.DropTable(
                name: "SupplierReturns",
                schema: "suppliers");

            migrationBuilder.DropIndex(
                name: "IX_SupplierLedgerEntries_BranchId",
                schema: "suppliers",
                table: "SupplierLedgerEntries");

            migrationBuilder.DropColumn(
                name: "BranchId",
                schema: "suppliers",
                table: "SupplierLedgerEntries");
        }
    }
}

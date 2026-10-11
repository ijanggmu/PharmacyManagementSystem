using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace FSH.Starter.Migrations.PostgreSQL.Purchasing
{
    /// <inheritdoc />
    public partial class AddBranchIdToDirectGoodsReceipts : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "DirectGoodsReceipts",
                schema: "purchasing",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    SupplierId = table.Column<Guid>(type: "uuid", nullable: false),
                    ReceiptDateUtc = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    SupplierInvoiceNumber = table.Column<string>(type: "character varying(128)", maxLength: 128, nullable: true),
                    Status = table.Column<string>(type: "character varying(16)", maxLength: 16, nullable: false),
                    BranchId = table.Column<Guid>(type: "uuid", nullable: false),
                    CreatedBy = table.Column<string>(type: "character varying(128)", maxLength: 128, nullable: false),
                    CreatedAtUtc = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    VoidedAtUtc = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    VoidedBy = table.Column<string>(type: "character varying(128)", maxLength: 128, nullable: true),
                    VoidReason = table.Column<string>(type: "character varying(512)", maxLength: 512, nullable: true),
                    TenantId = table.Column<string>(type: "text", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_DirectGoodsReceipts", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "DirectGoodsReceiptLines",
                schema: "purchasing",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    DirectGoodsReceiptId = table.Column<Guid>(type: "uuid", nullable: false),
                    MedicineId = table.Column<Guid>(type: "uuid", nullable: false),
                    Quantity = table.Column<decimal>(type: "numeric(18,3)", precision: 18, scale: 3, nullable: false),
                    UnitCostPrice = table.Column<decimal>(type: "numeric(18,2)", precision: 18, scale: 2, nullable: false),
                    VatAmount = table.Column<decimal>(type: "numeric(18,2)", precision: 18, scale: 2, nullable: false),
                    BranchId = table.Column<Guid>(type: "uuid", nullable: false),
                    TenantId = table.Column<string>(type: "text", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_DirectGoodsReceiptLines", x => x.Id);
                    table.ForeignKey(
                        name: "FK_DirectGoodsReceiptLines_DirectGoodsReceipts_DirectGoodsRece~",
                        column: x => x.DirectGoodsReceiptId,
                        principalSchema: "purchasing",
                        principalTable: "DirectGoodsReceipts",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "IX_DirectGoodsReceiptLines_BranchId",
                schema: "purchasing",
                table: "DirectGoodsReceiptLines",
                column: "BranchId");

            migrationBuilder.CreateIndex(
                name: "IX_DirectGoodsReceiptLines_DirectGoodsReceiptId",
                schema: "purchasing",
                table: "DirectGoodsReceiptLines",
                column: "DirectGoodsReceiptId");

            migrationBuilder.CreateIndex(
                name: "IX_DirectGoodsReceiptLines_MedicineId",
                schema: "purchasing",
                table: "DirectGoodsReceiptLines",
                column: "MedicineId");

            migrationBuilder.CreateIndex(
                name: "IX_DirectGoodsReceipts_BranchId",
                schema: "purchasing",
                table: "DirectGoodsReceipts",
                column: "BranchId");

            migrationBuilder.CreateIndex(
                name: "IX_DirectGoodsReceipts_ReceiptDateUtc",
                schema: "purchasing",
                table: "DirectGoodsReceipts",
                column: "ReceiptDateUtc");

            migrationBuilder.CreateIndex(
                name: "IX_DirectGoodsReceipts_Status",
                schema: "purchasing",
                table: "DirectGoodsReceipts",
                column: "Status");

            migrationBuilder.CreateIndex(
                name: "IX_DirectGoodsReceipts_SupplierId",
                schema: "purchasing",
                table: "DirectGoodsReceipts",
                column: "SupplierId");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "DirectGoodsReceiptLines",
                schema: "purchasing");

            migrationBuilder.DropTable(
                name: "DirectGoodsReceipts",
                schema: "purchasing");
        }
    }
}

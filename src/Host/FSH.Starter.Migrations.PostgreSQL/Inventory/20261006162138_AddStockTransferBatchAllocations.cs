using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace FSH.Starter.Migrations.PostgreSQL.Inventory
{
    /// <inheritdoc />
    public partial class AddStockTransferBatchAllocations : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "IX_MedicineBatches_MedicineId_BatchNo",
                schema: "inventory",
                table: "MedicineBatches");

            migrationBuilder.CreateTable(
                name: "StockTransferBatches",
                schema: "inventory",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    StockTransferId = table.Column<Guid>(type: "uuid", nullable: false),
                    MedicineId = table.Column<Guid>(type: "uuid", nullable: false),
                    SourceBatchId = table.Column<Guid>(type: "uuid", nullable: false),
                    BatchNo = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: false),
                    ExpiryDate = table.Column<DateOnly>(type: "date", nullable: false),
                    Quantity = table.Column<decimal>(type: "numeric(18,3)", precision: 18, scale: 3, nullable: false),
                    CostPrice = table.Column<decimal>(type: "numeric(18,2)", precision: 18, scale: 2, nullable: false),
                    SellingPrice = table.Column<decimal>(type: "numeric(18,2)", precision: 18, scale: 2, nullable: false),
                    TenantId = table.Column<string>(type: "text", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_StockTransferBatches", x => x.Id);
                });

            migrationBuilder.CreateIndex(
                name: "IX_MedicineBatches_MedicineId_BranchId_BatchNo",
                schema: "inventory",
                table: "MedicineBatches",
                columns: new[] { "MedicineId", "BranchId", "BatchNo", "TenantId" },
                unique: true,
                filter: "\"IsDisposed\" = FALSE");

            migrationBuilder.CreateIndex(
                name: "IX_StockTransferBatches_StockTransferId",
                schema: "inventory",
                table: "StockTransferBatches",
                column: "StockTransferId");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "StockTransferBatches",
                schema: "inventory");

            migrationBuilder.DropIndex(
                name: "IX_MedicineBatches_MedicineId_BranchId_BatchNo",
                schema: "inventory",
                table: "MedicineBatches");

            migrationBuilder.CreateIndex(
                name: "IX_MedicineBatches_MedicineId_BatchNo",
                schema: "inventory",
                table: "MedicineBatches",
                columns: new[] { "MedicineId", "BatchNo", "TenantId" },
                unique: true,
                filter: "\"IsDisposed\" = FALSE");
        }
    }
}

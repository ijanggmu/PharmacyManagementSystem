using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace FSH.Starter.Migrations.PostgreSQL.Inventory
{
    /// <inheritdoc />
    public partial class HardenDataIntegrity : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "MedicineLocationStocks",
                schema: "inventory");

            migrationBuilder.DropIndex(
                name: "IX_StockTransfers_FromLocationId_ToLocationId",
                schema: "inventory",
                table: "StockTransfers");

            migrationBuilder.DropColumn(
                name: "FromLocationId",
                schema: "inventory",
                table: "StockTransfers");

            migrationBuilder.DropColumn(
                name: "ToLocationId",
                schema: "inventory",
                table: "StockTransfers");

            migrationBuilder.AlterColumn<decimal>(
                name: "UnitPrice",
                schema: "inventory",
                table: "MedicinePriceHistories",
                type: "numeric(18,2)",
                precision: 18,
                scale: 2,
                nullable: false,
                oldClrType: typeof(decimal),
                oldType: "numeric(10,2)",
                oldPrecision: 10,
                oldScale: 2);

            migrationBuilder.AlterColumn<decimal>(
                name: "CostPrice",
                schema: "inventory",
                table: "MedicinePriceHistories",
                type: "numeric(18,2)",
                precision: 18,
                scale: 2,
                nullable: true,
                oldClrType: typeof(decimal),
                oldType: "numeric(10,2)",
                oldPrecision: 10,
                oldScale: 2,
                oldNullable: true);

            migrationBuilder.AlterNumericPrecisionIfLossless(
                name: "TotalAmount",
                schema: "inventory",
                table: "ConsignmentSettlements",
                precision: 18,
                scale: 2);

            migrationBuilder.AlterNumericPrecisionIfLossless(
                name: "UnitCostPrice",
                schema: "inventory",
                table: "ConsignmentPositions",
                precision: 18,
                scale: 2);

            migrationBuilder.AlterNumericPrecisionIfLossless(
                name: "SettledQuantity",
                schema: "inventory",
                table: "ConsignmentPositions",
                precision: 18,
                scale: 3);

            migrationBuilder.AlterNumericPrecisionIfLossless(
                name: "QuantityReceived",
                schema: "inventory",
                table: "ConsignmentPositions",
                precision: 18,
                scale: 3);

            migrationBuilder.CreateIndex(
                name: "IX_StockTransfers_ToBranchId",
                schema: "inventory",
                table: "StockTransfers",
                column: "ToBranchId");

            migrationBuilder.CreateIndex(
                name: "IX_StockTransferBatches_MedicineId",
                schema: "inventory",
                table: "StockTransferBatches",
                column: "MedicineId");

            migrationBuilder.CreateIndex(
                name: "IX_StockTransferBatches_SourceBatchId",
                schema: "inventory",
                table: "StockTransferBatches",
                column: "SourceBatchId");

            migrationBuilder.CreateIndex(
                name: "IX_Medicines_SupplierId",
                schema: "inventory",
                table: "Medicines",
                column: "SupplierId");

            migrationBuilder.CreateIndex(
                name: "IX_ConsignmentPositions_MedicineId",
                schema: "inventory",
                table: "ConsignmentPositions",
                column: "MedicineId");

            migrationBuilder.AddForeignKeyNotValid(
                name: "FK_ConsignmentPositions_MedicineBatches_BatchId",
                schema: "inventory",
                table: "ConsignmentPositions",
                column: "BatchId",
                principalSchema: "inventory",
                principalTable: "MedicineBatches",
                principalColumn: "Id",
                onDelete: ReferentialAction.Restrict);

            migrationBuilder.AddForeignKeyNotValid(
                name: "FK_ConsignmentPositions_Medicines_MedicineId",
                schema: "inventory",
                table: "ConsignmentPositions",
                column: "MedicineId",
                principalSchema: "inventory",
                principalTable: "Medicines",
                principalColumn: "Id",
                onDelete: ReferentialAction.Restrict);

            migrationBuilder.AddForeignKeyNotValid(
                name: "FK_InventoryTransactions_MedicineBatches_MedicineBatchId",
                schema: "inventory",
                table: "InventoryTransactions",
                column: "MedicineBatchId",
                principalSchema: "inventory",
                principalTable: "MedicineBatches",
                principalColumn: "Id",
                onDelete: ReferentialAction.Restrict);

            migrationBuilder.AddForeignKeyNotValid(
                name: "FK_InventoryTransactions_Medicines_MedicineId",
                schema: "inventory",
                table: "InventoryTransactions",
                column: "MedicineId",
                principalSchema: "inventory",
                principalTable: "Medicines",
                principalColumn: "Id",
                onDelete: ReferentialAction.Restrict);

            migrationBuilder.AddForeignKeyNotValid(
                name: "FK_MedicineBatches_Medicines_MedicineId",
                schema: "inventory",
                table: "MedicineBatches",
                column: "MedicineId",
                principalSchema: "inventory",
                principalTable: "Medicines",
                principalColumn: "Id",
                onDelete: ReferentialAction.Restrict);

            migrationBuilder.AddForeignKeyNotValid(
                name: "FK_MedicinePriceHistories_Medicines_MedicineId",
                schema: "inventory",
                table: "MedicinePriceHistories",
                column: "MedicineId",
                principalSchema: "inventory",
                principalTable: "Medicines",
                principalColumn: "Id",
                onDelete: ReferentialAction.Restrict);

            migrationBuilder.AddForeignKeyNotValid(
                name: "FK_StockTransferBatches_MedicineBatches_SourceBatchId",
                schema: "inventory",
                table: "StockTransferBatches",
                column: "SourceBatchId",
                principalSchema: "inventory",
                principalTable: "MedicineBatches",
                principalColumn: "Id",
                onDelete: ReferentialAction.Restrict);

            migrationBuilder.AddForeignKeyNotValid(
                name: "FK_StockTransferBatches_Medicines_MedicineId",
                schema: "inventory",
                table: "StockTransferBatches",
                column: "MedicineId",
                principalSchema: "inventory",
                principalTable: "Medicines",
                principalColumn: "Id",
                onDelete: ReferentialAction.Restrict);

            migrationBuilder.AddForeignKeyNotValid(
                name: "FK_StockTransferBatches_StockTransfers_StockTransferId",
                schema: "inventory",
                table: "StockTransferBatches",
                column: "StockTransferId",
                principalSchema: "inventory",
                principalTable: "StockTransfers",
                principalColumn: "Id",
                onDelete: ReferentialAction.Cascade);

            migrationBuilder.AddForeignKeyNotValid(
                name: "FK_StockTransferItems_Medicines_MedicineId",
                schema: "inventory",
                table: "StockTransferItems",
                column: "MedicineId",
                principalSchema: "inventory",
                principalTable: "Medicines",
                principalColumn: "Id",
                onDelete: ReferentialAction.Restrict);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "FK_ConsignmentPositions_MedicineBatches_BatchId",
                schema: "inventory",
                table: "ConsignmentPositions");

            migrationBuilder.DropForeignKey(
                name: "FK_ConsignmentPositions_Medicines_MedicineId",
                schema: "inventory",
                table: "ConsignmentPositions");

            migrationBuilder.DropForeignKey(
                name: "FK_InventoryTransactions_MedicineBatches_MedicineBatchId",
                schema: "inventory",
                table: "InventoryTransactions");

            migrationBuilder.DropForeignKey(
                name: "FK_InventoryTransactions_Medicines_MedicineId",
                schema: "inventory",
                table: "InventoryTransactions");

            migrationBuilder.DropForeignKey(
                name: "FK_MedicineBatches_Medicines_MedicineId",
                schema: "inventory",
                table: "MedicineBatches");

            migrationBuilder.DropForeignKey(
                name: "FK_MedicinePriceHistories_Medicines_MedicineId",
                schema: "inventory",
                table: "MedicinePriceHistories");

            migrationBuilder.DropForeignKey(
                name: "FK_StockTransferBatches_MedicineBatches_SourceBatchId",
                schema: "inventory",
                table: "StockTransferBatches");

            migrationBuilder.DropForeignKey(
                name: "FK_StockTransferBatches_Medicines_MedicineId",
                schema: "inventory",
                table: "StockTransferBatches");

            migrationBuilder.DropForeignKey(
                name: "FK_StockTransferBatches_StockTransfers_StockTransferId",
                schema: "inventory",
                table: "StockTransferBatches");

            migrationBuilder.DropForeignKey(
                name: "FK_StockTransferItems_Medicines_MedicineId",
                schema: "inventory",
                table: "StockTransferItems");

            migrationBuilder.DropIndex(
                name: "IX_StockTransfers_ToBranchId",
                schema: "inventory",
                table: "StockTransfers");

            migrationBuilder.DropIndex(
                name: "IX_StockTransferBatches_MedicineId",
                schema: "inventory",
                table: "StockTransferBatches");

            migrationBuilder.DropIndex(
                name: "IX_StockTransferBatches_SourceBatchId",
                schema: "inventory",
                table: "StockTransferBatches");

            migrationBuilder.DropIndex(
                name: "IX_Medicines_SupplierId",
                schema: "inventory",
                table: "Medicines");

            migrationBuilder.DropIndex(
                name: "IX_ConsignmentPositions_MedicineId",
                schema: "inventory",
                table: "ConsignmentPositions");

            migrationBuilder.AddColumn<Guid>(
                name: "FromLocationId",
                schema: "inventory",
                table: "StockTransfers",
                type: "uuid",
                nullable: false,
                defaultValue: Guid.Empty);

            migrationBuilder.AddColumn<Guid>(
                name: "ToLocationId",
                schema: "inventory",
                table: "StockTransfers",
                type: "uuid",
                nullable: false,
                defaultValue: Guid.Empty);

            migrationBuilder.AlterColumn<decimal>(
                name: "UnitPrice",
                schema: "inventory",
                table: "MedicinePriceHistories",
                type: "numeric(10,2)",
                precision: 10,
                scale: 2,
                nullable: false,
                oldClrType: typeof(decimal),
                oldType: "numeric(18,2)",
                oldPrecision: 18,
                oldScale: 2);

            migrationBuilder.AlterColumn<decimal>(
                name: "CostPrice",
                schema: "inventory",
                table: "MedicinePriceHistories",
                type: "numeric(10,2)",
                precision: 10,
                scale: 2,
                nullable: true,
                oldClrType: typeof(decimal),
                oldType: "numeric(18,2)",
                oldPrecision: 18,
                oldScale: 2,
                oldNullable: true);

            migrationBuilder.AlterColumn<decimal>(
                name: "TotalAmount",
                schema: "inventory",
                table: "ConsignmentSettlements",
                type: "numeric",
                nullable: false,
                oldClrType: typeof(decimal),
                oldType: "numeric(18,2)",
                oldPrecision: 18,
                oldScale: 2);

            migrationBuilder.AlterColumn<decimal>(
                name: "UnitCostPrice",
                schema: "inventory",
                table: "ConsignmentPositions",
                type: "numeric",
                nullable: false,
                oldClrType: typeof(decimal),
                oldType: "numeric(18,2)",
                oldPrecision: 18,
                oldScale: 2);

            migrationBuilder.AlterColumn<decimal>(
                name: "SettledQuantity",
                schema: "inventory",
                table: "ConsignmentPositions",
                type: "numeric",
                nullable: false,
                oldClrType: typeof(decimal),
                oldType: "numeric(18,3)",
                oldPrecision: 18,
                oldScale: 3);

            migrationBuilder.AlterColumn<decimal>(
                name: "QuantityReceived",
                schema: "inventory",
                table: "ConsignmentPositions",
                type: "numeric",
                nullable: false,
                oldClrType: typeof(decimal),
                oldType: "numeric(18,3)",
                oldPrecision: 18,
                oldScale: 3);

            migrationBuilder.CreateTable(
                name: "MedicineLocationStocks",
                schema: "inventory",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    CreatedAtUtc = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    LocationId = table.Column<Guid>(type: "uuid", nullable: false),
                    MedicineId = table.Column<Guid>(type: "uuid", nullable: false),
                    QuantityOnHand = table.Column<decimal>(type: "numeric(18,3)", precision: 18, scale: 3, nullable: false),
                    TenantId = table.Column<string>(type: "text", nullable: false),
                    UpdatedAtUtc = table.Column<DateTime>(type: "timestamp with time zone", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_MedicineLocationStocks", x => x.Id);
                });

            migrationBuilder.CreateIndex(
                name: "IX_StockTransfers_FromLocationId_ToLocationId",
                schema: "inventory",
                table: "StockTransfers",
                columns: new[] { "FromLocationId", "ToLocationId" });

            migrationBuilder.CreateIndex(
                name: "IX_MedicineLocationStocks_MedicineId_LocationId",
                schema: "inventory",
                table: "MedicineLocationStocks",
                columns: new[] { "MedicineId", "LocationId", "TenantId" },
                unique: true);
        }
    }
}

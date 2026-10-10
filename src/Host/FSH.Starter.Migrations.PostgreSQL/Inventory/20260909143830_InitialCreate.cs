using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace FSH.Starter.Migrations.PostgreSQL.Inventory
{
    /// <inheritdoc />
    public partial class InitialCreate : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.EnsureSchema(
                name: "inventory");

            migrationBuilder.CreateTable(
                name: "InventoryTransactions",
                schema: "inventory",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    MedicineId = table.Column<Guid>(type: "uuid", nullable: false),
                    MedicineBatchId = table.Column<Guid>(type: "uuid", nullable: false),
                    Type = table.Column<string>(type: "character varying(32)", maxLength: 32, nullable: false),
                    QuantityDelta = table.Column<decimal>(type: "numeric(18,3)", precision: 18, scale: 3, nullable: false),
                    UnitCostPrice = table.Column<decimal>(type: "numeric(18,2)", precision: 18, scale: 2, nullable: false),
                    ReferenceType = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: true),
                    ReferenceId = table.Column<Guid>(type: "uuid", nullable: true),
                    Notes = table.Column<string>(type: "character varying(512)", maxLength: 512, nullable: true),
                    CreatedAtUtc = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    TenantId = table.Column<string>(type: "text", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_InventoryTransactions", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "MedicineBatches",
                schema: "inventory",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    MedicineId = table.Column<Guid>(type: "uuid", nullable: false),
                    BatchNo = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: false),
                    ExpiryDate = table.Column<DateOnly>(type: "date", nullable: false),
                    QuantityOnHand = table.Column<decimal>(type: "numeric(18,3)", precision: 18, scale: 3, nullable: false),
                    CostPrice = table.Column<decimal>(type: "numeric(18,2)", precision: 18, scale: 2, nullable: false),
                    SellingPrice = table.Column<decimal>(type: "numeric(18,2)", precision: 18, scale: 2, nullable: false),
                    RackLocation = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: true),
                    IsDisposed = table.Column<bool>(type: "boolean", nullable: false),
                    CreatedAtUtc = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    UpdatedAtUtc = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    TenantId = table.Column<string>(type: "text", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_MedicineBatches", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "Medicines",
                schema: "inventory",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    Name = table.Column<string>(type: "character varying(256)", maxLength: 256, nullable: false),
                    GenericName = table.Column<string>(type: "character varying(256)", maxLength: 256, nullable: true),
                    CategoryId = table.Column<Guid>(type: "uuid", nullable: true),
                    ReorderLevel = table.Column<decimal>(type: "numeric(18,2)", precision: 18, scale: 2, nullable: false),
                    CreatedAtUtc = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    UpdatedAtUtc = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    IsDeleted = table.Column<bool>(type: "boolean", nullable: false),
                    DeletedOnUtc = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true),
                    DeletedBy = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: true),
                    TenantId = table.Column<string>(type: "text", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_Medicines", x => x.Id);
                });

            migrationBuilder.CreateIndex(
                name: "IX_InventoryTransactions_MedicineBatchId",
                schema: "inventory",
                table: "InventoryTransactions",
                column: "MedicineBatchId");

            migrationBuilder.CreateIndex(
                name: "IX_InventoryTransactions_MedicineId",
                schema: "inventory",
                table: "InventoryTransactions",
                column: "MedicineId");

            migrationBuilder.CreateIndex(
                name: "IX_InventoryTransactions_ReferenceType_ReferenceId",
                schema: "inventory",
                table: "InventoryTransactions",
                columns: new[] { "ReferenceType", "ReferenceId" });

            migrationBuilder.CreateIndex(
                name: "IX_MedicineBatches_ExpiryDate",
                schema: "inventory",
                table: "MedicineBatches",
                column: "ExpiryDate");

            migrationBuilder.CreateIndex(
                name: "IX_MedicineBatches_MedicineId",
                schema: "inventory",
                table: "MedicineBatches",
                column: "MedicineId");

            migrationBuilder.CreateIndex(
                name: "IX_MedicineBatches_MedicineId_BatchNo",
                schema: "inventory",
                table: "MedicineBatches",
                columns: new[] { "MedicineId", "BatchNo", "TenantId" },
                unique: true,
                filter: "\"IsDisposed\" = FALSE");

            migrationBuilder.CreateIndex(
                name: "IX_Medicines_CategoryId",
                schema: "inventory",
                table: "Medicines",
                column: "CategoryId");

            migrationBuilder.CreateIndex(
                name: "IX_Medicines_IsDeleted",
                schema: "inventory",
                table: "Medicines",
                column: "IsDeleted");

            migrationBuilder.CreateIndex(
                name: "IX_Medicines_Name",
                schema: "inventory",
                table: "Medicines",
                column: "Name");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "InventoryTransactions",
                schema: "inventory");

            migrationBuilder.DropTable(
                name: "MedicineBatches",
                schema: "inventory");

            migrationBuilder.DropTable(
                name: "Medicines",
                schema: "inventory");
        }
    }
}

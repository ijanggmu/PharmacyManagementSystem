using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace FSH.Starter.Migrations.PostgreSQL.Sales
{
    /// <inheritdoc />
    public partial class PosHoldAndPriceLevels : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<Guid>(
                name: "PriceLevelId",
                schema: "sales",
                table: "Sales",
                type: "uuid",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "PriceLevelName",
                schema: "sales",
                table: "Sales",
                type: "character varying(100)",
                maxLength: 100,
                nullable: true);

            migrationBuilder.CreateTable(
                name: "ParkedSales",
                schema: "sales",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    BranchId = table.Column<Guid>(type: "uuid", nullable: false),
                    Label = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: false),
                    CustomerId = table.Column<Guid>(type: "uuid", nullable: true),
                    CustomerName = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: true),
                    PrescriptionId = table.Column<Guid>(type: "uuid", nullable: true),
                    PriceLevelId = table.Column<Guid>(type: "uuid", nullable: true),
                    BuyerName = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: true),
                    BuyerPan = table.Column<string>(type: "character varying(20)", maxLength: 20, nullable: true),
                    BillDiscountAmount = table.Column<decimal>(type: "numeric(18,2)", precision: 18, scale: 2, nullable: false),
                    Notes = table.Column<string>(type: "character varying(1024)", maxLength: 1024, nullable: true),
                    TotalAmount = table.Column<decimal>(type: "numeric(18,2)", precision: 18, scale: 2, nullable: false),
                    LineCount = table.Column<int>(type: "integer", nullable: false),
                    LinesJson = table.Column<string>(type: "jsonb", nullable: false),
                    ParkedByUserId = table.Column<Guid>(type: "uuid", nullable: true),
                    ParkedByName = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: true),
                    ParkedAtUtc = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    ExpiresAtUtc = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    ClientParkId = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: true),
                    TenantId = table.Column<string>(type: "text", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_ParkedSales", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "PriceLevels",
                schema: "sales",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    Name = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: false),
                    DiscountPercent = table.Column<decimal>(type: "numeric(5,2)", precision: 5, scale: 2, nullable: false),
                    Description = table.Column<string>(type: "character varying(500)", maxLength: 500, nullable: true),
                    IsActive = table.Column<bool>(type: "boolean", nullable: false),
                    CreatedAtUtc = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    UpdatedAtUtc = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    TenantId = table.Column<string>(type: "text", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_PriceLevels", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "CustomerPriceLevels",
                schema: "sales",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    CustomerId = table.Column<Guid>(type: "uuid", nullable: false),
                    PriceLevelId = table.Column<Guid>(type: "uuid", nullable: false),
                    AssignedAtUtc = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    TenantId = table.Column<string>(type: "text", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_CustomerPriceLevels", x => x.Id);
                    table.ForeignKey(
                        name: "FK_CustomerPriceLevels_PriceLevels_PriceLevelId",
                        column: x => x.PriceLevelId,
                        principalSchema: "sales",
                        principalTable: "PriceLevels",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "PriceLevelItems",
                schema: "sales",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    PriceLevelId = table.Column<Guid>(type: "uuid", nullable: false),
                    MedicineId = table.Column<Guid>(type: "uuid", nullable: false),
                    UnitPrice = table.Column<decimal>(type: "numeric(18,2)", precision: 18, scale: 2, nullable: false),
                    UpdatedAtUtc = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    TenantId = table.Column<string>(type: "text", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_PriceLevelItems", x => x.Id);
                    table.ForeignKey(
                        name: "FK_PriceLevelItems_PriceLevels_PriceLevelId",
                        column: x => x.PriceLevelId,
                        principalSchema: "sales",
                        principalTable: "PriceLevels",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "IX_CustomerPriceLevels_PriceLevelId",
                schema: "sales",
                table: "CustomerPriceLevels",
                column: "PriceLevelId");

            migrationBuilder.CreateIndex(
                name: "IX_CustomerPriceLevels_TenantId_CustomerId",
                schema: "sales",
                table: "CustomerPriceLevels",
                columns: new[] { "TenantId", "CustomerId" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_ParkedSales_BranchId_ExpiresAtUtc",
                schema: "sales",
                table: "ParkedSales",
                columns: new[] { "BranchId", "ExpiresAtUtc" });

            migrationBuilder.CreateIndex(
                name: "UX_ParkedSales_TenantId_ClientParkId",
                schema: "sales",
                table: "ParkedSales",
                columns: new[] { "TenantId", "ClientParkId" },
                unique: true,
                filter: "\"ClientParkId\" IS NOT NULL");

            migrationBuilder.CreateIndex(
                name: "IX_PriceLevelItems_PriceLevelId_MedicineId",
                schema: "sales",
                table: "PriceLevelItems",
                columns: new[] { "PriceLevelId", "MedicineId", "TenantId" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_PriceLevels_TenantId_Name",
                schema: "sales",
                table: "PriceLevels",
                columns: new[] { "TenantId", "Name" },
                unique: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "CustomerPriceLevels",
                schema: "sales");

            migrationBuilder.DropTable(
                name: "ParkedSales",
                schema: "sales");

            migrationBuilder.DropTable(
                name: "PriceLevelItems",
                schema: "sales");

            migrationBuilder.DropTable(
                name: "PriceLevels",
                schema: "sales");

            migrationBuilder.DropColumn(
                name: "PriceLevelId",
                schema: "sales",
                table: "Sales");

            migrationBuilder.DropColumn(
                name: "PriceLevelName",
                schema: "sales",
                table: "Sales");
        }
    }
}

using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace FSH.Starter.Migrations.PostgreSQL.Onboarding
{
    /// <inheritdoc />
    public partial class AddOnboardingModelChanges : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "MigrationLineItems",
                schema: "onboarding",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    SessionId = table.Column<Guid>(type: "uuid", nullable: false),
                    Category = table.Column<string>(type: "character varying(20)", maxLength: 20, nullable: false),
                    PartyId = table.Column<Guid>(type: "uuid", nullable: true),
                    MedicineId = table.Column<Guid>(type: "uuid", nullable: true),
                    Amount = table.Column<decimal>(type: "numeric", nullable: true),
                    Quantity = table.Column<decimal>(type: "numeric", nullable: true),
                    UnitCost = table.Column<decimal>(type: "numeric", nullable: true),
                    SellingPrice = table.Column<decimal>(type: "numeric", nullable: true),
                    BatchNo = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: true),
                    ExpiryDate = table.Column<DateOnly>(type: "date", nullable: true),
                    Description = table.Column<string>(type: "character varying(1024)", maxLength: 1024, nullable: true),
                    CreatedAtUtc = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    TenantId = table.Column<string>(type: "text", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_MigrationLineItems", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "MigrationSessions",
                schema: "onboarding",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    CutoverDate = table.Column<DateOnly>(type: "date", nullable: false),
                    Notes = table.Column<string>(type: "character varying(1024)", maxLength: 1024, nullable: true),
                    Status = table.Column<string>(type: "character varying(20)", maxLength: 20, nullable: false),
                    CreatedBy = table.Column<string>(type: "character varying(256)", maxLength: 256, nullable: false),
                    CreatedAtUtc = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    CommittedAtUtc = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    CommittedBy = table.Column<string>(type: "character varying(256)", maxLength: 256, nullable: true),
                    BankVoucherId = table.Column<Guid>(type: "uuid", nullable: true),
                    CashVoucherId = table.Column<Guid>(type: "uuid", nullable: true),
                    CustomerVoucherId = table.Column<Guid>(type: "uuid", nullable: true),
                    SupplierVoucherId = table.Column<Guid>(type: "uuid", nullable: true),
                    StockVoucherId = table.Column<Guid>(type: "uuid", nullable: true),
                    TenantId = table.Column<string>(type: "text", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_MigrationSessions", x => x.Id);
                });

            migrationBuilder.CreateIndex(
                name: "IX_MigrationLineItems_SessionId_Category",
                schema: "onboarding",
                table: "MigrationLineItems",
                columns: new[] { "SessionId", "Category" });
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "MigrationLineItems",
                schema: "onboarding");

            migrationBuilder.DropTable(
                name: "MigrationSessions",
                schema: "onboarding");
        }
    }
}

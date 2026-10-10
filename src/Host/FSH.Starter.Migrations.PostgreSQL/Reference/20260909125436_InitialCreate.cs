using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace FSH.Starter.Migrations.PostgreSQL.Reference
{
    /// <inheritdoc />
    public partial class InitialCreate : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.EnsureSchema(
                name: "reference");

            migrationBuilder.CreateTable(
                name: "MedicineCategories",
                schema: "reference",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    Name = table.Column<string>(type: "character varying(128)", maxLength: 128, nullable: false),
                    Slug = table.Column<string>(type: "character varying(160)", maxLength: 160, nullable: false),
                    Description = table.Column<string>(type: "character varying(1024)", maxLength: 1024, nullable: true),
                    ParentCategoryId = table.Column<Guid>(type: "uuid", nullable: true),
                    CreatedAtUtc = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    UpdatedAtUtc = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    IsDeleted = table.Column<bool>(type: "boolean", nullable: false),
                    DeletedOnUtc = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true),
                    DeletedBy = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: true),
                    TenantId = table.Column<string>(type: "text", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_MedicineCategories", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "PharmacySettings",
                schema: "reference",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    BusinessName = table.Column<string>(type: "character varying(256)", maxLength: 256, nullable: false),
                    BusinessAddress = table.Column<string>(type: "character varying(512)", maxLength: 512, nullable: true),
                    BusinessPhone = table.Column<string>(type: "character varying(32)", maxLength: 32, nullable: true),
                    BusinessEmail = table.Column<string>(type: "character varying(256)", maxLength: 256, nullable: true),
                    CurrencyCode = table.Column<string>(type: "character varying(3)", maxLength: 3, nullable: false),
                    VatRatePercent = table.Column<decimal>(type: "numeric(5,2)", precision: 5, scale: 2, nullable: false),
                    InvoiceNumberPrefix = table.Column<string>(type: "character varying(16)", maxLength: 16, nullable: false),
                    NextInvoiceSequence = table.Column<int>(type: "integer", nullable: false),
                    UpdatedAtUtc = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    TenantId = table.Column<string>(type: "text", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_PharmacySettings", x => x.Id);
                });

            migrationBuilder.CreateIndex(
                name: "IX_MedicineCategories_IsDeleted",
                schema: "reference",
                table: "MedicineCategories",
                column: "IsDeleted");

            migrationBuilder.CreateIndex(
                name: "IX_MedicineCategories_ParentCategoryId",
                schema: "reference",
                table: "MedicineCategories",
                column: "ParentCategoryId");

            migrationBuilder.CreateIndex(
                name: "IX_MedicineCategories_Slug",
                schema: "reference",
                table: "MedicineCategories",
                columns: new[] { "Slug", "TenantId" },
                unique: true,
                filter: "\"IsDeleted\" = FALSE");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "MedicineCategories",
                schema: "reference");

            migrationBuilder.DropTable(
                name: "PharmacySettings",
                schema: "reference");
        }
    }
}

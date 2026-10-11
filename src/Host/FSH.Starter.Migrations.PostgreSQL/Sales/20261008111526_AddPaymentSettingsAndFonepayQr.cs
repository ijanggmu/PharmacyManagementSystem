using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace FSH.Starter.Migrations.PostgreSQL.Sales
{
    /// <inheritdoc />
    public partial class AddPaymentSettingsAndFonepayQr : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "FonepayQrRequests",
                schema: "sales",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    Prn = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: false),
                    Amount = table.Column<decimal>(type: "numeric(18,2)", precision: 18, scale: 2, nullable: false),
                    Environment = table.Column<string>(type: "character varying(8)", maxLength: 8, nullable: false),
                    Status = table.Column<string>(type: "character varying(16)", maxLength: 16, nullable: false),
                    TraceId = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: true),
                    Message = table.Column<string>(type: "character varying(500)", maxLength: 500, nullable: true),
                    CreatedAtUtc = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    CompletedAtUtc = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    LastCheckedAtUtc = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    TenantId = table.Column<string>(type: "text", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_FonepayQrRequests", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "PaymentSettings",
                schema: "sales",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    BankQrEnabled = table.Column<bool>(type: "boolean", nullable: false),
                    BankName = table.Column<string>(type: "character varying(150)", maxLength: 150, nullable: true),
                    AccountName = table.Column<string>(type: "character varying(150)", maxLength: 150, nullable: true),
                    AccountNumber = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: true),
                    BankQrImage = table.Column<string>(type: "text", nullable: true),
                    FonepayEnabled = table.Column<bool>(type: "boolean", nullable: false),
                    FonepayMerchantCode = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: true),
                    FonepayUsername = table.Column<string>(type: "character varying(128)", maxLength: 128, nullable: true),
                    FonepayEnvironment = table.Column<string>(type: "character varying(8)", maxLength: 8, nullable: false),
                    FonepayPasswordProtected = table.Column<string>(type: "text", nullable: true),
                    FonepaySecretKeyProtected = table.Column<string>(type: "text", nullable: true),
                    UpdatedAtUtc = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    TenantId = table.Column<string>(type: "text", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_PaymentSettings", x => x.Id);
                });

            migrationBuilder.CreateIndex(
                name: "IX_FonepayQrRequests_CreatedAtUtc",
                schema: "sales",
                table: "FonepayQrRequests",
                column: "CreatedAtUtc");

            migrationBuilder.CreateIndex(
                name: "IX_FonepayQrRequests_Prn",
                schema: "sales",
                table: "FonepayQrRequests",
                columns: new[] { "Prn", "TenantId" },
                unique: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "FonepayQrRequests",
                schema: "sales");

            migrationBuilder.DropTable(
                name: "PaymentSettings",
                schema: "sales");
        }
    }
}

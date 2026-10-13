using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace FSH.Starter.Migrations.PostgreSQL.Notifications
{
    /// <inheritdoc />
    public partial class AddSms : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "SmsMessages",
                schema: "notifications",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    Kind = table.Column<string>(type: "character varying(32)", maxLength: 32, nullable: false),
                    Trigger = table.Column<string>(type: "character varying(16)", maxLength: 16, nullable: false),
                    CustomerId = table.Column<Guid>(type: "uuid", nullable: true),
                    RecipientName = table.Column<string>(type: "character varying(256)", maxLength: 256, nullable: true),
                    Phone = table.Column<string>(type: "character varying(20)", maxLength: 20, nullable: false),
                    Body = table.Column<string>(type: "character varying(1000)", maxLength: 1000, nullable: false),
                    Language = table.Column<string>(type: "character varying(8)", maxLength: 8, nullable: false),
                    Segments = table.Column<int>(type: "integer", nullable: false),
                    Encoding = table.Column<string>(type: "character varying(16)", maxLength: 16, nullable: false),
                    Provider = table.Column<string>(type: "character varying(16)", maxLength: 16, nullable: false),
                    ReferenceKeys = table.Column<string>(type: "text", nullable: true),
                    IgnoresQuietHours = table.Column<bool>(type: "boolean", nullable: false),
                    Status = table.Column<string>(type: "character varying(16)", maxLength: 16, nullable: false),
                    Attempts = table.Column<int>(type: "integer", nullable: false),
                    NextAttemptAtUtc = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    LastAttemptAtUtc = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    LastError = table.Column<string>(type: "character varying(1000)", maxLength: 1000, nullable: true),
                    ResponseCode = table.Column<string>(type: "character varying(32)", maxLength: 32, nullable: true),
                    ResponseMessage = table.Column<string>(type: "character varying(500)", maxLength: 500, nullable: true),
                    ProviderMessageId = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: true),
                    Credits = table.Column<decimal>(type: "numeric(18,4)", precision: 18, scale: 4, nullable: true),
                    RequestedBy = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: true),
                    CreatedAtUtc = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    UpdatedAtUtc = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    SentAtUtc = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    TenantId = table.Column<string>(type: "text", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_SmsMessages", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "SmsSettings",
                schema: "notifications",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    Enabled = table.Column<bool>(type: "boolean", nullable: false),
                    Provider = table.Column<string>(type: "character varying(16)", maxLength: 16, nullable: false),
                    SenderId = table.Column<string>(type: "character varying(32)", maxLength: 32, nullable: true),
                    ApiTokenProtected = table.Column<string>(type: "text", nullable: true),
                    PharmacyName = table.Column<string>(type: "character varying(80)", maxLength: 80, nullable: true),
                    DefaultLanguage = table.Column<string>(type: "character varying(8)", maxLength: 8, nullable: false),
                    ReceiptsEnabled = table.Column<bool>(type: "boolean", nullable: false),
                    AutoDuesReminders = table.Column<bool>(type: "boolean", nullable: false),
                    DuesReminderDays = table.Column<int>(type: "integer", nullable: false),
                    AutoRefillReminders = table.Column<bool>(type: "boolean", nullable: false),
                    RefillReminderDays = table.Column<int>(type: "integer", nullable: false),
                    QuietHoursStart = table.Column<int>(type: "integer", nullable: false),
                    QuietHoursEnd = table.Column<int>(type: "integer", nullable: false),
                    MaxPerHour = table.Column<int>(type: "integer", nullable: false),
                    UpdatedAtUtc = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    TenantId = table.Column<string>(type: "text", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_SmsSettings", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "SmsTemplates",
                schema: "notifications",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    Kind = table.Column<string>(type: "character varying(32)", maxLength: 32, nullable: false),
                    Language = table.Column<string>(type: "character varying(8)", maxLength: 8, nullable: false),
                    Body = table.Column<string>(type: "character varying(1000)", maxLength: 1000, nullable: false),
                    UpdatedAtUtc = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    TenantId = table.Column<string>(type: "text", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_SmsTemplates", x => x.Id);
                });

            migrationBuilder.CreateIndex(
                name: "IX_SmsMessages_CreatedAtUtc",
                schema: "notifications",
                table: "SmsMessages",
                column: "CreatedAtUtc");

            migrationBuilder.CreateIndex(
                name: "IX_SmsMessages_CustomerId_Kind_CreatedAtUtc",
                schema: "notifications",
                table: "SmsMessages",
                columns: new[] { "CustomerId", "Kind", "CreatedAtUtc" });

            migrationBuilder.CreateIndex(
                name: "IX_SmsMessages_Status_NextAttemptAtUtc",
                schema: "notifications",
                table: "SmsMessages",
                columns: new[] { "Status", "NextAttemptAtUtc" });

            migrationBuilder.CreateIndex(
                name: "IX_SmsTemplates_TenantId_Kind_Language",
                schema: "notifications",
                table: "SmsTemplates",
                columns: new[] { "TenantId", "Kind", "Language" },
                unique: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "SmsMessages",
                schema: "notifications");

            migrationBuilder.DropTable(
                name: "SmsSettings",
                schema: "notifications");

            migrationBuilder.DropTable(
                name: "SmsTemplates",
                schema: "notifications");
        }
    }
}

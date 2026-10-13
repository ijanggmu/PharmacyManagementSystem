using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace FSH.Starter.Migrations.PostgreSQL.Sales
{
    /// <inheritdoc />
    public partial class IrdCbmsEBilling : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "BuyerName",
                schema: "sales",
                table: "Sales",
                type: "character varying(200)",
                maxLength: 200,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "BuyerPan",
                schema: "sales",
                table: "Sales",
                type: "character varying(20)",
                maxLength: 20,
                nullable: true);

            migrationBuilder.AddColumn<DateTime>(
                name: "DocumentDateUtc",
                schema: "sales",
                table: "IrdInvoiceQueues",
                type: "timestamp with time zone",
                nullable: true);

            migrationBuilder.AddColumn<Guid>(
                name: "DocumentId",
                schema: "sales",
                table: "IrdInvoiceQueues",
                type: "uuid",
                nullable: false,
                defaultValue: Guid.Empty);

            migrationBuilder.AddColumn<string>(
                name: "DocumentNumber",
                schema: "sales",
                table: "IrdInvoiceQueues",
                type: "character varying(100)",
                maxLength: 100,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "DocumentType",
                schema: "sales",
                table: "IrdInvoiceQueues",
                type: "character varying(16)",
                maxLength: 16,
                nullable: false,
                defaultValue: "Bill");

            migrationBuilder.AddColumn<bool>(
                name: "IsRealtime",
                schema: "sales",
                table: "IrdInvoiceQueues",
                type: "boolean",
                nullable: true);

            migrationBuilder.AddColumn<DateTime>(
                name: "LastAttemptAtUtc",
                schema: "sales",
                table: "IrdInvoiceQueues",
                type: "timestamp with time zone",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "ResponseCode",
                schema: "sales",
                table: "IrdInvoiceQueues",
                type: "character varying(32)",
                maxLength: 32,
                nullable: true);

            migrationBuilder.AddColumn<DateTime>(
                name: "SentAtUtc",
                schema: "sales",
                table: "IrdInvoiceQueues",
                type: "timestamp with time zone",
                nullable: true);

            migrationBuilder.CreateTable(
                name: "IrdSettings",
                schema: "sales",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    Enabled = table.Column<bool>(type: "boolean", nullable: false),
                    BaseUrl = table.Column<string>(type: "character varying(300)", maxLength: 300, nullable: true),
                    Username = table.Column<string>(type: "character varying(128)", maxLength: 128, nullable: true),
                    PasswordProtected = table.Column<string>(type: "text", nullable: true),
                    SellerPan = table.Column<string>(type: "character varying(20)", maxLength: 20, nullable: true),
                    AbbreviatedInvoiceThreshold = table.Column<decimal>(type: "numeric(18,2)", precision: 18, scale: 2, nullable: false),
                    UpdatedAtUtc = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    TenantId = table.Column<string>(type: "text", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_IrdSettings", x => x.Id);
                });

            // Rows queued before this migration are all bills: their document is the sale itself.
            migrationBuilder.Sql(
                """
                UPDATE sales."IrdInvoiceQueues" q
                SET "DocumentId" = q."SaleId",
                    "DocumentNumber" = s."InvoiceNumber"
                FROM sales."Sales" s
                WHERE s."Id" = q."SaleId";
                """);

            migrationBuilder.CreateIndex(
                name: "IX_IrdInvoiceQueues_DocumentType_DocumentId",
                schema: "sales",
                table: "IrdInvoiceQueues",
                columns: new[] { "DocumentType", "DocumentId" });
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "IrdSettings",
                schema: "sales");

            migrationBuilder.DropIndex(
                name: "IX_IrdInvoiceQueues_DocumentType_DocumentId",
                schema: "sales",
                table: "IrdInvoiceQueues");

            migrationBuilder.DropColumn(
                name: "BuyerName",
                schema: "sales",
                table: "Sales");

            migrationBuilder.DropColumn(
                name: "BuyerPan",
                schema: "sales",
                table: "Sales");

            migrationBuilder.DropColumn(
                name: "DocumentDateUtc",
                schema: "sales",
                table: "IrdInvoiceQueues");

            migrationBuilder.DropColumn(
                name: "DocumentId",
                schema: "sales",
                table: "IrdInvoiceQueues");

            migrationBuilder.DropColumn(
                name: "DocumentNumber",
                schema: "sales",
                table: "IrdInvoiceQueues");

            migrationBuilder.DropColumn(
                name: "DocumentType",
                schema: "sales",
                table: "IrdInvoiceQueues");

            migrationBuilder.DropColumn(
                name: "IsRealtime",
                schema: "sales",
                table: "IrdInvoiceQueues");

            migrationBuilder.DropColumn(
                name: "LastAttemptAtUtc",
                schema: "sales",
                table: "IrdInvoiceQueues");

            migrationBuilder.DropColumn(
                name: "ResponseCode",
                schema: "sales",
                table: "IrdInvoiceQueues");

            migrationBuilder.DropColumn(
                name: "SentAtUtc",
                schema: "sales",
                table: "IrdInvoiceQueues");
        }
    }
}

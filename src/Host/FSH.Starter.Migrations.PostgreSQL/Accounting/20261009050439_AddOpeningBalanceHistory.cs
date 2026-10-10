using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace FSH.Starter.Migrations.PostgreSQL.Accounting
{
    /// <inheritdoc />
    public partial class AddOpeningBalanceHistory : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "OpeningBalanceHistory",
                schema: "accounting",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    BranchId = table.Column<Guid>(type: "uuid", nullable: false),
                    Sequence = table.Column<int>(type: "integer", nullable: false),
                    Action = table.Column<string>(type: "character varying(16)", maxLength: 16, nullable: false),
                    OpeningDate = table.Column<DateOnly>(type: "date", nullable: true),
                    PreviousOpeningDate = table.Column<DateOnly>(type: "date", nullable: true),
                    PostedVoucherId = table.Column<Guid>(type: "uuid", nullable: true),
                    ReversedVoucherId = table.Column<Guid>(type: "uuid", nullable: true),
                    ReversalVoucherId = table.Column<Guid>(type: "uuid", nullable: true),
                    TotalDebit = table.Column<decimal>(type: "numeric(18,2)", precision: 18, scale: 2, nullable: false),
                    TotalCredit = table.Column<decimal>(type: "numeric(18,2)", precision: 18, scale: 2, nullable: false),
                    EquityAdjustmentDebit = table.Column<decimal>(type: "numeric(18,2)", precision: 18, scale: 2, nullable: false),
                    EquityAdjustmentCredit = table.Column<decimal>(type: "numeric(18,2)", precision: 18, scale: 2, nullable: false),
                    EntriesJson = table.Column<string>(type: "jsonb", nullable: false),
                    ChangesJson = table.Column<string>(type: "jsonb", nullable: false),
                    Reason = table.Column<string>(type: "character varying(500)", maxLength: 500, nullable: true),
                    PerformedByUserId = table.Column<Guid>(type: "uuid", nullable: false),
                    PerformedByName = table.Column<string>(type: "character varying(256)", maxLength: 256, nullable: false),
                    PerformedAtUtc = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    TenantId = table.Column<string>(type: "text", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_OpeningBalanceHistory", x => x.Id);
                });

            migrationBuilder.CreateIndex(
                name: "IX_OpeningBalanceHistory_BranchId_Sequence",
                schema: "accounting",
                table: "OpeningBalanceHistory",
                columns: new[] { "BranchId", "Sequence", "TenantId" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_OpeningBalanceHistory_PerformedAtUtc",
                schema: "accounting",
                table: "OpeningBalanceHistory",
                column: "PerformedAtUtc");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "OpeningBalanceHistory",
                schema: "accounting");
        }
    }
}

using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace FSH.Starter.Migrations.PostgreSQL.Sales
{
    /// <inheritdoc />
    public partial class AddCashShifts : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "CashShifts",
                schema: "sales",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    OpenedAtUtc = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    OpenedBy = table.Column<string>(type: "character varying(256)", maxLength: 256, nullable: false),
                    OpeningFloat = table.Column<decimal>(type: "numeric", nullable: false),
                    ClosedAtUtc = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    ClosedBy = table.Column<string>(type: "character varying(256)", maxLength: 256, nullable: true),
                    ClosingCashCounted = table.Column<decimal>(type: "numeric", nullable: true),
                    Status = table.Column<string>(type: "character varying(16)", maxLength: 16, nullable: false),
                    Notes = table.Column<string>(type: "character varying(1024)", maxLength: 1024, nullable: true),
                    TenantId = table.Column<string>(type: "text", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_CashShifts", x => x.Id);
                });

            migrationBuilder.CreateIndex(
                name: "IX_CashShifts_OpenedAtUtc",
                schema: "sales",
                table: "CashShifts",
                column: "OpenedAtUtc");

            migrationBuilder.CreateIndex(
                name: "IX_CashShifts_Status",
                schema: "sales",
                table: "CashShifts",
                column: "Status");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "CashShifts",
                schema: "sales");
        }
    }
}

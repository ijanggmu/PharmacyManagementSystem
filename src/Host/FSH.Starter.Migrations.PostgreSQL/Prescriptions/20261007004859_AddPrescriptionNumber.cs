using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace FSH.Starter.Migrations.PostgreSQL.Prescriptions
{
    /// <inheritdoc />
    public partial class AddPrescriptionNumber : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "PrescriptionNumber",
                schema: "prescriptions",
                table: "Prescriptions",
                type: "character varying(32)",
                maxLength: 32,
                nullable: true);

            // Backfill legacy rows with RX-<first 8 hex of id> so the NOT NULL + unique constraints can be applied.
            migrationBuilder.Sql(
                """
                UPDATE prescriptions."Prescriptions"
                SET "PrescriptionNumber" = 'RX-' || left("Id"::text, 8)
                WHERE "PrescriptionNumber" IS NULL;
                """);

            migrationBuilder.AlterColumn<string>(
                name: "PrescriptionNumber",
                schema: "prescriptions",
                table: "Prescriptions",
                type: "character varying(32)",
                maxLength: 32,
                nullable: false,
                oldClrType: typeof(string),
                oldType: "character varying(32)",
                oldMaxLength: 32,
                oldNullable: true);

            migrationBuilder.CreateTable(
                name: "PrescriptionNumberSequences",
                schema: "prescriptions",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    LastNumber = table.Column<int>(type: "integer", nullable: false),
                    TenantId = table.Column<string>(type: "text", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_PrescriptionNumberSequences", x => x.Id);
                });

            migrationBuilder.CreateIndex(
                name: "IX_Prescriptions_PrescriptionNumber",
                schema: "prescriptions",
                table: "Prescriptions",
                columns: new[] { "PrescriptionNumber", "TenantId" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_PrescriptionNumberSequences_TenantId",
                schema: "prescriptions",
                table: "PrescriptionNumberSequences",
                column: "TenantId",
                unique: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "PrescriptionNumberSequences",
                schema: "prescriptions");

            migrationBuilder.DropIndex(
                name: "IX_Prescriptions_PrescriptionNumber",
                schema: "prescriptions",
                table: "Prescriptions");

            migrationBuilder.DropColumn(
                name: "PrescriptionNumber",
                schema: "prescriptions",
                table: "Prescriptions");
        }
    }
}

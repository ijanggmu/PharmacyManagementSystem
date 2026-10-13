using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace FSH.Starter.Migrations.PostgreSQL.Accounting
{
    /// <inheritdoc />
    public partial class VoucherAuditStamps : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "CreatedBy",
                schema: "accounting",
                table: "Vouchers",
                type: "character varying(450)",
                maxLength: 450,
                nullable: true);

            migrationBuilder.AddColumn<DateTimeOffset>(
                name: "CreatedOnUtc",
                schema: "accounting",
                table: "Vouchers",
                type: "timestamp with time zone",
                nullable: false,
                defaultValue: new DateTimeOffset(new DateTime(1, 1, 1, 0, 0, 0, 0, DateTimeKind.Unspecified), new TimeSpan(0, 0, 0, 0, 0)));

            migrationBuilder.AddColumn<string>(
                name: "LastModifiedBy",
                schema: "accounting",
                table: "Vouchers",
                type: "character varying(450)",
                maxLength: 450,
                nullable: true);

            migrationBuilder.AddColumn<DateTimeOffset>(
                name: "LastModifiedOnUtc",
                schema: "accounting",
                table: "Vouchers",
                type: "timestamp with time zone",
                nullable: true);

            // Existing vouchers: the audit timestamp is the voucher's own creation time (who created it is unknown,
            // so the segregation-of-duties rule doesn't block posting those drafts).
            migrationBuilder.Sql("UPDATE accounting.\"Vouchers\" SET \"CreatedOnUtc\" = \"CreatedAtUtc\";");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "CreatedBy",
                schema: "accounting",
                table: "Vouchers");

            migrationBuilder.DropColumn(
                name: "CreatedOnUtc",
                schema: "accounting",
                table: "Vouchers");

            migrationBuilder.DropColumn(
                name: "LastModifiedBy",
                schema: "accounting",
                table: "Vouchers");

            migrationBuilder.DropColumn(
                name: "LastModifiedOnUtc",
                schema: "accounting",
                table: "Vouchers");
        }
    }
}

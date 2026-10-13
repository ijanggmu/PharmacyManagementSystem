using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace FSH.Starter.Migrations.PostgreSQL.Accounting
{
    /// <inheritdoc />
    public partial class TypeWiseVoucherSeries : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            // Type-wise voucher series: one counter per (tenant, series). The existing row becomes the legacy
            // shared counter (Series = ''); it is never incremented again, and each new series row starts after
            // it (AccountingVoucherSequenceService), so new numbers never repeat a legacy one.
            migrationBuilder.DropIndex(
                name: "IX_VoucherSequences_TenantId",
                schema: "accounting",
                table: "VoucherSequences");

            migrationBuilder.AddColumn<string>(
                name: "Series",
                schema: "accounting",
                table: "VoucherSequences",
                type: "character varying(8)",
                maxLength: 8,
                nullable: false,
                defaultValue: "");

            migrationBuilder.CreateIndex(
                name: "IX_VoucherSequences_TenantId_Series",
                schema: "accounting",
                table: "VoucherSequences",
                columns: new[] { "TenantId", "Series" },
                unique: true);

            // A posted voucher number is issued once per tenant. Legacy numbers all came from the one shared
            // counter, so they should already be unique, but before HardenDataIntegrity a tenant could hold
            // several counter rows; guarded so any legacy duplicate logs a WARNING instead of failing the deploy.
            migrationBuilder.CreateUniqueIndexIfNoDuplicates(
                name: "IX_Vouchers_TenantId_VoucherNo",
                schema: "accounting",
                table: "Vouchers",
                columns: new[] { "TenantId", "VoucherNo" },
                filter: "\"VoucherNo\" <> 'DRAFT'");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndexIfExists("IX_Vouchers_TenantId_VoucherNo", schema: "accounting");

            // Back to one shared counter per tenant: it must continue after the highest number any series
            // issued, so no number is reused, then the per-series rows go.
            migrationBuilder.Sql("""
                INSERT INTO accounting."VoucherSequences" ("Id", "TenantId", "Series", "LastNumber")
                SELECT gen_random_uuid(), s."TenantId", '', max(s."LastNumber")
                FROM accounting."VoucherSequences" s
                GROUP BY s."TenantId"
                ON CONFLICT ("TenantId", "Series") DO UPDATE SET "LastNumber" = EXCLUDED."LastNumber";

                DELETE FROM accounting."VoucherSequences" WHERE "Series" <> '';
                """);

            migrationBuilder.DropIndex(
                name: "IX_VoucherSequences_TenantId_Series",
                schema: "accounting",
                table: "VoucherSequences");

            migrationBuilder.DropColumn(
                name: "Series",
                schema: "accounting",
                table: "VoucherSequences");

            migrationBuilder.CreateIndex(
                name: "IX_VoucherSequences_TenantId",
                schema: "accounting",
                table: "VoucherSequences",
                column: "TenantId",
                unique: true);
        }
    }
}

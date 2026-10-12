using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace FSH.Starter.Migrations.PostgreSQL.Accounting
{
    /// <inheritdoc />
    public partial class AddPendingReversalsAndPostingLockUniqueness : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "PendingReversals",
                schema: "accounting",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    ReferenceType = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: false),
                    ReferenceId = table.Column<Guid>(type: "uuid", nullable: false),
                    Reason = table.Column<string>(type: "character varying(512)", maxLength: 512, nullable: false),
                    ReversalDateUtc = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    CreatedAtUtc = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    ResolvedAtUtc = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    ReversalVoucherId = table.Column<Guid>(type: "uuid", nullable: true),
                    TenantId = table.Column<string>(type: "text", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_PendingReversals", x => x.Id);
                });

            // Two concurrent first postings could each create a posting-lock row, after which the app read an
            // arbitrary one. Keep the most restrictive row per tenant (latest lock date, then the most recently
            // updated) so merging never reopens a closed period.
            migrationBuilder.Sql("""
                DELETE FROM accounting."PostingLocks" p
                USING accounting."PostingLocks" o
                WHERE p."TenantId" = o."TenantId"
                  AND p."Id" <> o."Id"
                  AND (COALESCE(o."LockDate", DATE '0001-01-01'), COALESCE(o."UpdatedAtUtc", TIMESTAMPTZ '0001-01-01'), o."Id")
                    > (COALESCE(p."LockDate", DATE '0001-01-01'), COALESCE(p."UpdatedAtUtc", TIMESTAMPTZ '0001-01-01'), p."Id");
                """);

            // One posting-lock row per tenant (the conflict target of the first-use upsert). Guarded like the
            // other integrity indexes: if duplicates somehow remain, the migrator logs a WARNING instead of
            // failing the deploy (the app still reads a single row).
            migrationBuilder.CreateUniqueIndexIfNoDuplicates(
                name: "IX_PostingLocks_TenantId",
                schema: "accounting",
                table: "PostingLocks",
                columns: new[] { "TenantId" });

            migrationBuilder.CreateIndex(
                name: "IX_PendingReversals_TenantId_ReferenceType_ReferenceId",
                schema: "accounting",
                table: "PendingReversals",
                columns: new[] { "TenantId", "ReferenceType", "ReferenceId" },
                unique: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "PendingReversals",
                schema: "accounting");

            migrationBuilder.DropIndexIfExists("IX_PostingLocks_TenantId", schema: "accounting");
        }
    }
}

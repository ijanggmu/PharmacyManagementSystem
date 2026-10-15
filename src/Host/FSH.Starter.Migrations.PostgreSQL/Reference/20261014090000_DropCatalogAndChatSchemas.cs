using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace FSH.Starter.Migrations.PostgreSQL.Reference
{
    /// <summary>
    /// Drops the tables of the removed Catalog and Chat starter modules (docs/adr/0004). Their DbContexts
    /// no longer exist, so the drop rides on Reference's migration set: each module owned a whole schema,
    /// dropped with CASCADE, and their rows in a shared migrations-history table (if one exists in
    /// "public") are removed so the history matches the code. Model-free: Reference's snapshot is unchanged.
    /// </summary>
    public partial class DropCatalogAndChatSchemas : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.Sql("DROP SCHEMA IF EXISTS catalog CASCADE;");
            migrationBuilder.Sql("DROP SCHEMA IF EXISTS chat CASCADE;");
            migrationBuilder.Sql(@"
DO $$
BEGIN
    IF to_regclass('public.""__EFMigrationsHistory""') IS NOT NULL THEN
        DELETE FROM public.""__EFMigrationsHistory""
        WHERE ""MigrationId"" IN (
                    '20260430033202_InitialCatalog',
                    '20260430033849_AddCategories',
                    '20260430034535_AddProducts',
                    '20260430103838_AddSoftDelete',
                    '20260512142004_AddProductImages',
                    '20260512144952_ProductImageValueGenerationNever',
                    '20260512162229_DropProductImagesThumbnailUniqueIndex',
                    '20260517105359_CatalogTenantIsolation',
                    '20260626195522_CatalogMoneyValueObject',
                    '20260512193158_InitialChat',
                    '20260512205427_AddMessageMentions',
                    '20260512210921_AddMessageReactions',
                    '20260512211141_AddMessagesFullTextSearch',
                    '20260513115215_AddMessagePinning',
                    '20260517105429_ChatTenantIsolation',
                    '20260612201021_DropChannelMemberIsMuted');
    END IF;
END $$;");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            // Irreversible: the Catalog and Chat modules and their migrations were deleted with this change.
        }
    }
}

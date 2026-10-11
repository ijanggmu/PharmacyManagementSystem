using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace FSH.Starter.Migrations.PostgreSQL.Customers
{
    /// <inheritdoc />
    public partial class AddCustomerCodeAndCreditLimit : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "Code",
                schema: "customers",
                table: "Customers",
                type: "character varying(32)",
                maxLength: 32,
                nullable: false,
                defaultValue: "");

            migrationBuilder.AddColumn<decimal>(
                name: "CreditLimit",
                schema: "customers",
                table: "Customers",
                type: "numeric(18,2)",
                precision: 18,
                scale: 2,
                nullable: true);

            // Existing customers get numbers in sign-up order, per tenant (trashed ones too, so a
            // restore never collides), and each tenant's counter continues after the last one.
            migrationBuilder.Sql("""
                UPDATE customers."Customers" c
                SET "Code" = 'C-' || lpad(n.rn::text, 6, '0')
                FROM (
                    SELECT "Id", row_number() OVER (PARTITION BY "TenantId" ORDER BY "CreatedAtUtc", "Id") AS rn
                    FROM customers."Customers"
                ) n
                WHERE c."Id" = n."Id";

                INSERT INTO customers."NumberSequences" ("Id", "TenantId", "BranchId", "Series", "FiscalYear", "LastNumber")
                SELECT gen_random_uuid(), "TenantId", '00000000-0000-0000-0000-000000000000', 'CUS', 0, count(*)
                FROM customers."Customers"
                GROUP BY "TenantId"
                ON CONFLICT ("TenantId", "BranchId", "Series", "FiscalYear")
                DO UPDATE SET "LastNumber" = GREATEST(customers."NumberSequences"."LastNumber", EXCLUDED."LastNumber");
                """);

            migrationBuilder.CreateIndex(
                name: "IX_Customers_Code",
                schema: "customers",
                table: "Customers",
                columns: new[] { "Code", "TenantId" },
                unique: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "IX_Customers_Code",
                schema: "customers",
                table: "Customers");

            migrationBuilder.DropColumn(
                name: "Code",
                schema: "customers",
                table: "Customers");

            migrationBuilder.DropColumn(
                name: "CreditLimit",
                schema: "customers",
                table: "Customers");
        }
    }
}

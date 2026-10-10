using FSH.Modules.Customers.Data;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace FSH.Starter.Migrations.PostgreSQL.Customers
{
    /// <summary>
    /// Additive: adds the recorded-allergies text[] column the Sales safety check reads through
    /// GetCustomerAllergiesQuery. Existing customers get an empty list, matching the legacy
    /// `allergies TEXT[] NOT NULL DEFAULT '{}'` (scripts/86-dispensing-safety-controls.sql).
    /// </summary>
    [DbContext(typeof(CustomersDbContext))]
    [Migration("20261006120000_AddCustomerAllergies")]
    public partial class AddCustomerAllergies : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string[]>(
                name: "Allergies",
                schema: "customers",
                table: "Customers",
                type: "text[]",
                nullable: false,
                defaultValueSql: "'{}'");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "Allergies",
                schema: "customers",
                table: "Customers");
        }
    }
}

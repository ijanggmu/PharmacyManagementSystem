using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace FSH.Starter.Migrations.PostgreSQL.Customers
{
    /// <inheritdoc />
    public partial class AddCustomerBirthDateAndInsurance : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<DateOnly>(
                name: "DateOfBirth",
                schema: "customers",
                table: "Customers",
                type: "date",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "InsuranceProvider",
                schema: "customers",
                table: "Customers",
                type: "character varying(128)",
                maxLength: 128,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "InsuranceNumber",
                schema: "customers",
                table: "Customers",
                type: "character varying(64)",
                maxLength: 64,
                nullable: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "DateOfBirth",
                schema: "customers",
                table: "Customers");

            migrationBuilder.DropColumn(
                name: "InsuranceProvider",
                schema: "customers",
                table: "Customers");

            migrationBuilder.DropColumn(
                name: "InsuranceNumber",
                schema: "customers",
                table: "Customers");
        }
    }
}

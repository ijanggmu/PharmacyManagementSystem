using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace FSH.Starter.Migrations.PostgreSQL.Accounting
{
    /// <inheritdoc />
    public partial class AddPaymentMethodAccounts : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<Guid>(
                name: "AccountId",
                schema: "accounting",
                table: "BankReconciliations",
                type: "uuid",
                nullable: true);

            migrationBuilder.AddColumn<Guid>(
                name: "AccountId",
                schema: "accounting",
                table: "BankDeposits",
                type: "uuid",
                nullable: true);

            migrationBuilder.CreateTable(
                name: "PaymentMethodAccounts",
                schema: "accounting",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    Method = table.Column<string>(type: "character varying(32)", maxLength: 32, nullable: false),
                    AccountId = table.Column<Guid>(type: "uuid", nullable: false),
                    UpdatedAtUtc = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    UpdatedBy = table.Column<string>(type: "character varying(256)", maxLength: 256, nullable: false),
                    TenantId = table.Column<string>(type: "text", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_PaymentMethodAccounts", x => x.Id);
                    table.ForeignKey(
                        name: "FK_PaymentMethodAccounts_Accounts_AccountId",
                        column: x => x.AccountId,
                        principalSchema: "accounting",
                        principalTable: "Accounts",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateIndex(
                name: "IX_BankReconciliations_AccountId",
                schema: "accounting",
                table: "BankReconciliations",
                column: "AccountId");

            migrationBuilder.CreateIndex(
                name: "IX_BankDeposits_AccountId",
                schema: "accounting",
                table: "BankDeposits",
                column: "AccountId");

            migrationBuilder.CreateIndex(
                name: "IX_PaymentMethodAccounts_AccountId",
                schema: "accounting",
                table: "PaymentMethodAccounts",
                column: "AccountId");

            migrationBuilder.CreateIndex(
                name: "IX_PaymentMethodAccounts_TenantId_Method",
                schema: "accounting",
                table: "PaymentMethodAccounts",
                columns: new[] { "TenantId", "Method" },
                unique: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "PaymentMethodAccounts",
                schema: "accounting");

            migrationBuilder.DropIndex(
                name: "IX_BankReconciliations_AccountId",
                schema: "accounting",
                table: "BankReconciliations");

            migrationBuilder.DropIndex(
                name: "IX_BankDeposits_AccountId",
                schema: "accounting",
                table: "BankDeposits");

            migrationBuilder.DropColumn(
                name: "AccountId",
                schema: "accounting",
                table: "BankReconciliations");

            migrationBuilder.DropColumn(
                name: "AccountId",
                schema: "accounting",
                table: "BankDeposits");
        }
    }
}

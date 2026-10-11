using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace FSH.Starter.Migrations.PostgreSQL.Accounting
{
    /// <inheritdoc />
    public partial class HardenDataIntegrity : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AlterNumericPrecisionIfLossless(
                name: "Amount",
                schema: "accounting",
                table: "Expenses",
                precision: 18,
                scale: 2);

            migrationBuilder.AlterNumericPrecisionIfLossless(
                name: "Variance",
                schema: "accounting",
                table: "BankReconciliations",
                precision: 18,
                scale: 2);

            migrationBuilder.AlterNumericPrecisionIfLossless(
                name: "StatementBalance",
                schema: "accounting",
                table: "BankReconciliations",
                precision: 18,
                scale: 2);

            migrationBuilder.AlterNumericPrecisionIfLossless(
                name: "GlBalance",
                schema: "accounting",
                table: "BankReconciliations",
                precision: 18,
                scale: 2);

            migrationBuilder.AlterNumericPrecisionIfLossless(
                name: "Amount",
                schema: "accounting",
                table: "BankDeposits",
                precision: 18,
                scale: 2);

            // One counter per tenant (the ON CONFLICT target of the voucher-number upsert). The old
            // UPDATE ... RETURNING bumped every row of a tenant, so any extra rows are redundant: keep the
            // highest counter per tenant so no voucher number is ever reissued.
            migrationBuilder.Sql("""
                DELETE FROM accounting."VoucherSequences" s
                USING accounting."VoucherSequences" o
                WHERE s."TenantId" = o."TenantId"
                  AND (s."LastNumber" < o."LastNumber" OR (s."LastNumber" = o."LastNumber" AND s."Id" < o."Id"));
                """);

            migrationBuilder.CreateIndex(
                name: "IX_VoucherSequences_TenantId",
                schema: "accounting",
                table: "VoucherSequences",
                column: "TenantId",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_OpeningBalanceHistory_PostedVoucherId",
                schema: "accounting",
                table: "OpeningBalanceHistory",
                column: "PostedVoucherId");

            migrationBuilder.CreateIndex(
                name: "IX_OpeningBalanceHistory_ReversalVoucherId",
                schema: "accounting",
                table: "OpeningBalanceHistory",
                column: "ReversalVoucherId");

            migrationBuilder.CreateIndex(
                name: "IX_OpeningBalanceHistory_ReversedVoucherId",
                schema: "accounting",
                table: "OpeningBalanceHistory",
                column: "ReversedVoucherId");

            migrationBuilder.AddForeignKeyNotValid(
                name: "FK_BankStatementImports_Accounts_AccountId",
                schema: "accounting",
                table: "BankStatementImports",
                column: "AccountId",
                principalSchema: "accounting",
                principalTable: "Accounts",
                principalColumn: "Id",
                onDelete: ReferentialAction.Restrict);

            migrationBuilder.AddForeignKeyNotValid(
                name: "FK_BankStatementLines_VoucherLines_MatchedVoucherLineId",
                schema: "accounting",
                table: "BankStatementLines",
                column: "MatchedVoucherLineId",
                principalSchema: "accounting",
                principalTable: "VoucherLines",
                principalColumn: "Id",
                onDelete: ReferentialAction.SetNull);

            migrationBuilder.AddForeignKeyNotValid(
                name: "FK_OpeningBalanceHistory_Vouchers_PostedVoucherId",
                schema: "accounting",
                table: "OpeningBalanceHistory",
                column: "PostedVoucherId",
                principalSchema: "accounting",
                principalTable: "Vouchers",
                principalColumn: "Id",
                onDelete: ReferentialAction.Restrict);

            migrationBuilder.AddForeignKeyNotValid(
                name: "FK_OpeningBalanceHistory_Vouchers_ReversalVoucherId",
                schema: "accounting",
                table: "OpeningBalanceHistory",
                column: "ReversalVoucherId",
                principalSchema: "accounting",
                principalTable: "Vouchers",
                principalColumn: "Id",
                onDelete: ReferentialAction.Restrict);

            migrationBuilder.AddForeignKeyNotValid(
                name: "FK_OpeningBalanceHistory_Vouchers_ReversedVoucherId",
                schema: "accounting",
                table: "OpeningBalanceHistory",
                column: "ReversedVoucherId",
                principalSchema: "accounting",
                principalTable: "Vouchers",
                principalColumn: "Id",
                onDelete: ReferentialAction.Restrict);

            migrationBuilder.AddForeignKeyNotValid(
                name: "FK_VoucherLines_Accounts_AccountId",
                schema: "accounting",
                table: "VoucherLines",
                column: "AccountId",
                principalSchema: "accounting",
                principalTable: "Accounts",
                principalColumn: "Id",
                onDelete: ReferentialAction.Restrict);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "FK_BankStatementImports_Accounts_AccountId",
                schema: "accounting",
                table: "BankStatementImports");

            migrationBuilder.DropForeignKey(
                name: "FK_BankStatementLines_VoucherLines_MatchedVoucherLineId",
                schema: "accounting",
                table: "BankStatementLines");

            migrationBuilder.DropForeignKey(
                name: "FK_OpeningBalanceHistory_Vouchers_PostedVoucherId",
                schema: "accounting",
                table: "OpeningBalanceHistory");

            migrationBuilder.DropForeignKey(
                name: "FK_OpeningBalanceHistory_Vouchers_ReversalVoucherId",
                schema: "accounting",
                table: "OpeningBalanceHistory");

            migrationBuilder.DropForeignKey(
                name: "FK_OpeningBalanceHistory_Vouchers_ReversedVoucherId",
                schema: "accounting",
                table: "OpeningBalanceHistory");

            migrationBuilder.DropForeignKey(
                name: "FK_VoucherLines_Accounts_AccountId",
                schema: "accounting",
                table: "VoucherLines");

            migrationBuilder.DropIndex(
                name: "IX_VoucherSequences_TenantId",
                schema: "accounting",
                table: "VoucherSequences");

            migrationBuilder.DropIndex(
                name: "IX_OpeningBalanceHistory_PostedVoucherId",
                schema: "accounting",
                table: "OpeningBalanceHistory");

            migrationBuilder.DropIndex(
                name: "IX_OpeningBalanceHistory_ReversalVoucherId",
                schema: "accounting",
                table: "OpeningBalanceHistory");

            migrationBuilder.DropIndex(
                name: "IX_OpeningBalanceHistory_ReversedVoucherId",
                schema: "accounting",
                table: "OpeningBalanceHistory");

            migrationBuilder.AlterColumn<decimal>(
                name: "Amount",
                schema: "accounting",
                table: "Expenses",
                type: "numeric",
                nullable: false,
                oldClrType: typeof(decimal),
                oldType: "numeric(18,2)",
                oldPrecision: 18,
                oldScale: 2);

            migrationBuilder.AlterColumn<decimal>(
                name: "Variance",
                schema: "accounting",
                table: "BankReconciliations",
                type: "numeric",
                nullable: false,
                oldClrType: typeof(decimal),
                oldType: "numeric(18,2)",
                oldPrecision: 18,
                oldScale: 2);

            migrationBuilder.AlterColumn<decimal>(
                name: "StatementBalance",
                schema: "accounting",
                table: "BankReconciliations",
                type: "numeric",
                nullable: false,
                oldClrType: typeof(decimal),
                oldType: "numeric(18,2)",
                oldPrecision: 18,
                oldScale: 2);

            migrationBuilder.AlterColumn<decimal>(
                name: "GlBalance",
                schema: "accounting",
                table: "BankReconciliations",
                type: "numeric",
                nullable: false,
                oldClrType: typeof(decimal),
                oldType: "numeric(18,2)",
                oldPrecision: 18,
                oldScale: 2);

            migrationBuilder.AlterColumn<decimal>(
                name: "Amount",
                schema: "accounting",
                table: "BankDeposits",
                type: "numeric",
                nullable: false,
                oldClrType: typeof(decimal),
                oldType: "numeric(18,2)",
                oldPrecision: 18,
                oldScale: 2);
        }
    }
}

using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace FSH.Starter.Migrations.PostgreSQL.Accounting
{
    /// <inheritdoc />
    public partial class AddBranchIdToAccountingEntities : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<Guid>(
                name: "BranchId",
                schema: "accounting",
                table: "Vouchers",
                type: "uuid",
                nullable: true);

            migrationBuilder.AddColumn<Guid>(
                name: "ReversesVoucherId",
                schema: "accounting",
                table: "Vouchers",
                type: "uuid",
                nullable: true);

            migrationBuilder.AddColumn<Guid>(
                name: "BranchId",
                schema: "accounting",
                table: "VoucherLines",
                type: "uuid",
                nullable: true);

            migrationBuilder.AddColumn<Guid>(
                name: "BranchId",
                schema: "accounting",
                table: "Expenses",
                type: "uuid",
                nullable: true);

            migrationBuilder.AddColumn<DateTime>(
                name: "UpdatedAtUtc",
                schema: "accounting",
                table: "Expenses",
                type: "timestamp with time zone",
                nullable: true);

            migrationBuilder.AddColumn<Guid>(
                name: "BranchId",
                schema: "accounting",
                table: "BankReconciliations",
                type: "uuid",
                nullable: true);

            migrationBuilder.AddColumn<Guid>(
                name: "BranchId",
                schema: "accounting",
                table: "BankDeposits",
                type: "uuid",
                nullable: false,
                defaultValue: Guid.Empty);

            migrationBuilder.CreateTable(
                name: "BankStatementImports",
                schema: "accounting",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    AccountId = table.Column<Guid>(type: "uuid", nullable: false),
                    StatementLabel = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: true),
                    PeriodStartUtc = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    PeriodEndUtc = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    OpeningBalance = table.Column<decimal>(type: "numeric(14,2)", precision: 14, scale: 2, nullable: true),
                    ClosingBalance = table.Column<decimal>(type: "numeric(14,2)", precision: 14, scale: 2, nullable: true),
                    Status = table.Column<string>(type: "character varying(16)", maxLength: 16, nullable: false),
                    CreatedBy = table.Column<string>(type: "character varying(256)", maxLength: 256, nullable: false),
                    CreatedAtUtc = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    ReconciledBy = table.Column<string>(type: "character varying(256)", maxLength: 256, nullable: true),
                    ReconciledAtUtc = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    BranchId = table.Column<Guid>(type: "uuid", nullable: true),
                    TenantId = table.Column<string>(type: "text", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_BankStatementImports", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "PostingLocks",
                schema: "accounting",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    LockDate = table.Column<DateOnly>(type: "date", nullable: true),
                    UpdatedAtUtc = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    UpdatedBy = table.Column<string>(type: "character varying(256)", maxLength: 256, nullable: true),
                    TenantId = table.Column<string>(type: "text", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_PostingLocks", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "BankStatementLines",
                schema: "accounting",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    ImportId = table.Column<Guid>(type: "uuid", nullable: false),
                    LineNo = table.Column<int>(type: "integer", nullable: false),
                    TxnDateUtc = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    Description = table.Column<string>(type: "character varying(1024)", maxLength: 1024, nullable: true),
                    Reference = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: true),
                    DebitAmount = table.Column<decimal>(type: "numeric(14,2)", precision: 14, scale: 2, nullable: false),
                    CreditAmount = table.Column<decimal>(type: "numeric(14,2)", precision: 14, scale: 2, nullable: false),
                    Status = table.Column<string>(type: "character varying(16)", maxLength: 16, nullable: false),
                    MatchedVoucherLineId = table.Column<Guid>(type: "uuid", nullable: true),
                    MatchedAtUtc = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    MatchedBy = table.Column<string>(type: "character varying(256)", maxLength: 256, nullable: true),
                    Note = table.Column<string>(type: "character varying(1024)", maxLength: 1024, nullable: true),
                    TenantId = table.Column<string>(type: "text", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_BankStatementLines", x => x.Id);
                    table.ForeignKey(
                        name: "FK_BankStatementLines_BankStatementImports_ImportId",
                        column: x => x.ImportId,
                        principalSchema: "accounting",
                        principalTable: "BankStatementImports",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "IX_Vouchers_BranchId",
                schema: "accounting",
                table: "Vouchers",
                column: "BranchId");

            migrationBuilder.CreateIndex(
                name: "IX_Vouchers_ReversesVoucherId",
                schema: "accounting",
                table: "Vouchers",
                column: "ReversesVoucherId");

            migrationBuilder.CreateIndex(
                name: "IX_VoucherLines_BranchId",
                schema: "accounting",
                table: "VoucherLines",
                column: "BranchId");

            migrationBuilder.CreateIndex(
                name: "IX_Expenses_BranchId",
                schema: "accounting",
                table: "Expenses",
                column: "BranchId");

            migrationBuilder.CreateIndex(
                name: "IX_BankReconciliations_BranchId",
                schema: "accounting",
                table: "BankReconciliations",
                column: "BranchId");

            migrationBuilder.CreateIndex(
                name: "IX_BankDeposits_BranchId",
                schema: "accounting",
                table: "BankDeposits",
                column: "BranchId");

            migrationBuilder.CreateIndex(
                name: "IX_BankStatementImports_AccountId_PeriodEndUtc",
                schema: "accounting",
                table: "BankStatementImports",
                columns: new[] { "AccountId", "PeriodEndUtc" });

            migrationBuilder.CreateIndex(
                name: "IX_BankStatementImports_BranchId",
                schema: "accounting",
                table: "BankStatementImports",
                column: "BranchId");

            migrationBuilder.CreateIndex(
                name: "IX_BankStatementImports_Status",
                schema: "accounting",
                table: "BankStatementImports",
                column: "Status");

            migrationBuilder.CreateIndex(
                name: "IX_BankStatementLines_ImportId",
                schema: "accounting",
                table: "BankStatementLines",
                column: "ImportId");

            migrationBuilder.CreateIndex(
                name: "IX_BankStatementLines_MatchedVoucherLineId",
                schema: "accounting",
                table: "BankStatementLines",
                columns: new[] { "MatchedVoucherLineId", "TenantId" },
                unique: true,
                filter: "\"MatchedVoucherLineId\" IS NOT NULL");

            migrationBuilder.CreateIndex(
                name: "IX_BankStatementLines_Status",
                schema: "accounting",
                table: "BankStatementLines",
                column: "Status");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "BankStatementLines",
                schema: "accounting");

            migrationBuilder.DropTable(
                name: "PostingLocks",
                schema: "accounting");

            migrationBuilder.DropTable(
                name: "BankStatementImports",
                schema: "accounting");

            migrationBuilder.DropIndex(
                name: "IX_Vouchers_BranchId",
                schema: "accounting",
                table: "Vouchers");

            migrationBuilder.DropIndex(
                name: "IX_Vouchers_ReversesVoucherId",
                schema: "accounting",
                table: "Vouchers");

            migrationBuilder.DropIndex(
                name: "IX_VoucherLines_BranchId",
                schema: "accounting",
                table: "VoucherLines");

            migrationBuilder.DropIndex(
                name: "IX_Expenses_BranchId",
                schema: "accounting",
                table: "Expenses");

            migrationBuilder.DropIndex(
                name: "IX_BankReconciliations_BranchId",
                schema: "accounting",
                table: "BankReconciliations");

            migrationBuilder.DropIndex(
                name: "IX_BankDeposits_BranchId",
                schema: "accounting",
                table: "BankDeposits");

            migrationBuilder.DropColumn(
                name: "BranchId",
                schema: "accounting",
                table: "Vouchers");

            migrationBuilder.DropColumn(
                name: "ReversesVoucherId",
                schema: "accounting",
                table: "Vouchers");

            migrationBuilder.DropColumn(
                name: "BranchId",
                schema: "accounting",
                table: "VoucherLines");

            migrationBuilder.DropColumn(
                name: "BranchId",
                schema: "accounting",
                table: "Expenses");

            migrationBuilder.DropColumn(
                name: "UpdatedAtUtc",
                schema: "accounting",
                table: "Expenses");

            migrationBuilder.DropColumn(
                name: "BranchId",
                schema: "accounting",
                table: "BankReconciliations");

            migrationBuilder.DropColumn(
                name: "BranchId",
                schema: "accounting",
                table: "BankDeposits");
        }
    }
}

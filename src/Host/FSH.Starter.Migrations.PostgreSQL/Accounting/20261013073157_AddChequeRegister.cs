using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace FSH.Starter.Migrations.PostgreSQL.Accounting
{
    /// <inheritdoc />
    public partial class AddChequeRegister : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "Cheques",
                schema: "accounting",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    Direction = table.Column<string>(type: "character varying(16)", maxLength: 16, nullable: false),
                    Status = table.Column<string>(type: "character varying(16)", maxLength: 16, nullable: false),
                    PartyId = table.Column<Guid>(type: "uuid", nullable: false),
                    PartyName = table.Column<string>(type: "character varying(256)", maxLength: 256, nullable: false),
                    BankName = table.Column<string>(type: "character varying(128)", maxLength: 128, nullable: true),
                    ChequeNumber = table.Column<string>(type: "character varying(32)", maxLength: 32, nullable: false),
                    ChequeDateUtc = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    Amount = table.Column<decimal>(type: "numeric(18,2)", precision: 18, scale: 2, nullable: false),
                    PaymentReferenceType = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: false),
                    PaymentReferenceId = table.Column<Guid>(type: "uuid", nullable: false),
                    PaymentDateUtc = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    PostedToBank = table.Column<bool>(type: "boolean", nullable: false),
                    BankAccountId = table.Column<Guid>(type: "uuid", nullable: true),
                    DepositedDateUtc = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    ClearedDateUtc = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    BranchId = table.Column<Guid>(type: "uuid", nullable: true),
                    Notes = table.Column<string>(type: "character varying(512)", maxLength: 512, nullable: true),
                    CreatedAtUtc = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    UpdatedAtUtc = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    TenantId = table.Column<string>(type: "text", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_Cheques", x => x.Id);
                    table.ForeignKey(
                        name: "FK_Cheques_Accounts_BankAccountId",
                        column: x => x.BankAccountId,
                        principalSchema: "accounting",
                        principalTable: "Accounts",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "ChequeStatusChanges",
                schema: "accounting",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    ChequeId = table.Column<Guid>(type: "uuid", nullable: false),
                    FromStatus = table.Column<string>(type: "character varying(16)", maxLength: 16, nullable: true),
                    ToStatus = table.Column<string>(type: "character varying(16)", maxLength: 16, nullable: false),
                    EffectiveDateUtc = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    ChangedAtUtc = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    ChangedBy = table.Column<string>(type: "character varying(256)", maxLength: 256, nullable: false),
                    Note = table.Column<string>(type: "character varying(512)", maxLength: 512, nullable: true),
                    VoucherId = table.Column<Guid>(type: "uuid", nullable: true),
                    TenantId = table.Column<string>(type: "text", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_ChequeStatusChanges", x => x.Id);
                    table.ForeignKey(
                        name: "FK_ChequeStatusChanges_Cheques_ChequeId",
                        column: x => x.ChequeId,
                        principalSchema: "accounting",
                        principalTable: "Cheques",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "IX_Cheques_BankAccountId",
                schema: "accounting",
                table: "Cheques",
                column: "BankAccountId");

            migrationBuilder.CreateIndex(
                name: "IX_Cheques_BranchId",
                schema: "accounting",
                table: "Cheques",
                column: "BranchId");

            migrationBuilder.CreateIndex(
                name: "IX_Cheques_Direction",
                schema: "accounting",
                table: "Cheques",
                column: "Direction");

            migrationBuilder.CreateIndex(
                name: "IX_Cheques_PartyId",
                schema: "accounting",
                table: "Cheques",
                column: "PartyId");

            migrationBuilder.CreateIndex(
                name: "IX_Cheques_Status_ChequeDateUtc",
                schema: "accounting",
                table: "Cheques",
                columns: new[] { "Status", "ChequeDateUtc" });

            migrationBuilder.CreateIndex(
                name: "IX_Cheques_TenantId_PaymentReferenceType_PaymentReferenceId",
                schema: "accounting",
                table: "Cheques",
                columns: new[] { "TenantId", "PaymentReferenceType", "PaymentReferenceId" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_ChequeStatusChanges_ChequeId",
                schema: "accounting",
                table: "ChequeStatusChanges",
                column: "ChequeId");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "ChequeStatusChanges",
                schema: "accounting");

            migrationBuilder.DropTable(
                name: "Cheques",
                schema: "accounting");
        }
    }
}

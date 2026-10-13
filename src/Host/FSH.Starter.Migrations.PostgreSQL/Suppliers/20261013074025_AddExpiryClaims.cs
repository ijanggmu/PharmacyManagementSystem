using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace FSH.Starter.Migrations.PostgreSQL.Suppliers
{
    /// <inheritdoc />
    public partial class AddExpiryClaims : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "ExpiryClaims",
                schema: "suppliers",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    ClaimNumber = table.Column<string>(type: "character varying(32)", maxLength: 32, nullable: false),
                    SupplierId = table.Column<Guid>(type: "uuid", nullable: false),
                    BranchId = table.Column<Guid>(type: "uuid", nullable: true),
                    Status = table.Column<string>(type: "character varying(16)", maxLength: 16, nullable: false),
                    Notes = table.Column<string>(type: "character varying(1024)", maxLength: 1024, nullable: true),
                    CreatedAtUtc = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    SentAtUtc = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    RespondedAtUtc = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    CreditedAtUtc = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    UpdatedAtUtc = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    SupplierReturnId = table.Column<Guid>(type: "uuid", nullable: true),
                    DebitNoteNumber = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: true),
                    SupplierCreditNoteNumber = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: true),
                    RejectionReason = table.Column<string>(type: "character varying(512)", maxLength: 512, nullable: true),
                    TenantId = table.Column<string>(type: "text", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_ExpiryClaims", x => x.Id);
                    table.ForeignKey(
                        name: "FK_ExpiryClaims_Suppliers_SupplierId",
                        column: x => x.SupplierId,
                        principalSchema: "suppliers",
                        principalTable: "Suppliers",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "ExpiryClaimLines",
                schema: "suppliers",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    ExpiryClaimId = table.Column<Guid>(type: "uuid", nullable: false),
                    MedicineId = table.Column<Guid>(type: "uuid", nullable: false),
                    MedicineName = table.Column<string>(type: "character varying(256)", maxLength: 256, nullable: false),
                    BatchId = table.Column<Guid>(type: "uuid", nullable: false),
                    BatchNo = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: false),
                    ExpiryDate = table.Column<DateOnly>(type: "date", nullable: false),
                    Quantity = table.Column<decimal>(type: "numeric(18,3)", precision: 18, scale: 3, nullable: false),
                    UnitCost = table.Column<decimal>(type: "numeric(18,2)", precision: 18, scale: 2, nullable: false),
                    AcceptedQuantity = table.Column<decimal>(type: "numeric(18,3)", precision: 18, scale: 3, nullable: true),
                    TenantId = table.Column<string>(type: "text", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_ExpiryClaimLines", x => x.Id);
                    table.ForeignKey(
                        name: "FK_ExpiryClaimLines_ExpiryClaims_ExpiryClaimId",
                        column: x => x.ExpiryClaimId,
                        principalSchema: "suppliers",
                        principalTable: "ExpiryClaims",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "IX_ExpiryClaimLines_BatchId",
                schema: "suppliers",
                table: "ExpiryClaimLines",
                column: "BatchId");

            migrationBuilder.CreateIndex(
                name: "IX_ExpiryClaimLines_ExpiryClaimId",
                schema: "suppliers",
                table: "ExpiryClaimLines",
                column: "ExpiryClaimId");

            migrationBuilder.CreateIndex(
                name: "IX_ExpiryClaims_BranchId_Status",
                schema: "suppliers",
                table: "ExpiryClaims",
                columns: new[] { "BranchId", "Status" });

            migrationBuilder.CreateIndex(
                name: "IX_ExpiryClaims_CreatedAtUtc",
                schema: "suppliers",
                table: "ExpiryClaims",
                column: "CreatedAtUtc");

            migrationBuilder.CreateIndex(
                name: "IX_ExpiryClaims_SupplierId",
                schema: "suppliers",
                table: "ExpiryClaims",
                column: "SupplierId");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "ExpiryClaimLines",
                schema: "suppliers");

            migrationBuilder.DropTable(
                name: "ExpiryClaims",
                schema: "suppliers");
        }
    }
}

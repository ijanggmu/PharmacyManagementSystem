using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace FSH.Starter.Migrations.PostgreSQL.Inventory
{
    /// <summary>
    /// Keeps a lot's unit cost (and the cost on its stock movements and transfer lines) to 4 decimal places, so a
    /// bill's net spread over its units, or a weighted average after a top-up, keeps the stock value in step with
    /// the books. Widening the scale loses nothing.
    /// </summary>
    public partial class FourDecimalLotCost : Migration
    {
        private static readonly (string Table, string Column)[] Columns =
        [
            ("MedicineBatches", "CostPrice"),
            ("StockTransferBatches", "CostPrice"),
            ("InventoryTransactions", "UnitCostPrice"),
        ];

        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            foreach (var (table, column) in Columns)
            {
                migrationBuilder.AlterColumn<decimal>(
                    name: column,
                    schema: "inventory",
                    table: table,
                    type: "numeric(18,4)",
                    precision: 18,
                    scale: 4,
                    nullable: false,
                    oldClrType: typeof(decimal),
                    oldType: "numeric(18,2)",
                    oldPrecision: 18,
                    oldScale: 2);
            }
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            foreach (var (table, column) in Columns)
            {
                migrationBuilder.AlterColumn<decimal>(
                    name: column,
                    schema: "inventory",
                    table: table,
                    type: "numeric(18,2)",
                    precision: 18,
                    scale: 2,
                    nullable: false,
                    oldClrType: typeof(decimal),
                    oldType: "numeric(18,4)",
                    oldPrecision: 18,
                    oldScale: 4);
            }
        }
    }
}

using System.Data;
using System.Data.Common;
using System.Globalization;
using FSH.Modules.Multitenancy.Contracts.v1.GetBranchById;
using FSH.Modules.Purchasing.Data;
using FSH.Modules.Purchasing.Domain;
using FSH.Modules.Sales.Contracts.Fiscal;
using Mediator;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Storage;

namespace FSH.Modules.Purchasing.Services;

/// <summary>Serial numbering for direct goods receipts (abstracted so handler unit tests on the InMemory
/// provider, which can't run the raw-SQL counter, can substitute it).</summary>
public interface IReceiptNumberService
{
    /// <summary>The branch code that goes into the number. Resolve it before opening the receipt's
    /// transaction: the branch lives in another module, whose read must not run on the shared connection
    /// mid-transaction.</summary>
    Task<string> ResolveBranchCodeAsync(Guid branchId, CancellationToken cancellationToken = default);

    /// <summary>Next goods-receipt serial for (current tenant, branch, fiscal year). Call inside the
    /// transaction that saves the receipt.</summary>
    Task<int> ReserveNextAsync(Guid branchId, int fiscalYear, CancellationToken cancellationToken = default);
}

/// <summary>
/// Reserves sequential goods-receipt numbers: <c>GRN-{branchCode}-{fiscalYear}-{n:D5}</c>, e.g.
/// <c>GRN-MAIN-2083/84-00001</c> — the same shape as the Sales invoice series. The counter restarts every
/// Nepali fiscal year and runs separately per branch. The first use inserts the (branch, year) counter row
/// (ON CONFLICT DO NOTHING), then one <c>UPDATE ... RETURNING</c> locks and increments it on the caller's
/// transaction, so concurrent receipts get distinct numbers and a rolled-back receipt releases its number.
/// </summary>
public sealed class ReceiptNumberService(PurchasingDbContext dbContext, IMediator mediator) : IReceiptNumberService
{
    public async Task<string> ResolveBranchCodeAsync(Guid branchId, CancellationToken cancellationToken = default)
    {
        var branch = await mediator.Send(new GetBranchByIdQuery(branchId), cancellationToken).ConfigureAwait(false);
        return branch.Code.Trim().ToUpperInvariant();
    }

    public static string Format(string branchCode, int fiscalYear, int sequence) =>
        string.Create(
            CultureInfo.InvariantCulture,
            $"{PurchasingSeries.GoodsReceipt}-{branchCode}-{NepalFiscalYear.Label(fiscalYear)}-{sequence:D5}");

    public async Task<int> ReserveNextAsync(Guid branchId, int fiscalYear, CancellationToken cancellationToken = default)
    {
        string tenantId = dbContext.TenantInfo?.Id
            ?? throw new InvalidOperationException("No tenant resolved for this request.");

        var connection = dbContext.Database.GetDbConnection();
        bool openedHere = false;
        if (connection.State != ConnectionState.Open)
        {
            await connection.OpenAsync(cancellationToken).ConfigureAwait(false);
            openedHere = true;
        }

        try
        {
            var transaction = dbContext.Database.CurrentTransaction?.GetDbTransaction();

            await using (var insert = connection.CreateCommand())
            {
                insert.Transaction = transaction;
                insert.CommandText = $"""
                    INSERT INTO "{PurchasingDbContext.Schema}"."NumberSequences" ("Id", "TenantId", "BranchId", "Series", "FiscalYear", "LastNumber")
                    VALUES (gen_random_uuid(), @tenantId, @branchId, @series, @fiscalYear, 0)
                    ON CONFLICT ("TenantId", "BranchId", "Series", "FiscalYear") DO NOTHING
                    """;
                AddParameters(insert, tenantId, branchId, fiscalYear);
                await insert.ExecuteNonQueryAsync(cancellationToken).ConfigureAwait(false);
            }

            await using var update = connection.CreateCommand();
            update.Transaction = transaction;
            update.CommandText = $"""
                UPDATE "{PurchasingDbContext.Schema}"."NumberSequences"
                SET "LastNumber" = "LastNumber" + 1
                WHERE "TenantId" = @tenantId AND "BranchId" = @branchId AND "Series" = @series AND "FiscalYear" = @fiscalYear
                RETURNING "LastNumber"
                """;
            AddParameters(update, tenantId, branchId, fiscalYear);

            object? result = await update.ExecuteScalarAsync(cancellationToken).ConfigureAwait(false)
                ?? throw new InvalidOperationException("Receipt number sequence row could not be created.");
            return Convert.ToInt32(result, CultureInfo.InvariantCulture);
        }
        finally
        {
            if (openedHere && dbContext.Database.CurrentTransaction is null)
            {
                await connection.CloseAsync().ConfigureAwait(false);
            }
        }
    }

    private static void AddParameters(DbCommand command, string tenantId, Guid branchId, int fiscalYear)
    {
        Add(command, "tenantId", tenantId);
        Add(command, "branchId", branchId);
        Add(command, "series", PurchasingSeries.GoodsReceipt);
        Add(command, "fiscalYear", fiscalYear);
    }

    private static void Add(DbCommand command, string name, object value)
    {
        var parameter = command.CreateParameter();
        parameter.ParameterName = name;
        parameter.Value = value;
        command.Parameters.Add(parameter);
    }
}

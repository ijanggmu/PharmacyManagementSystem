using System.Globalization;
using FSH.Modules.Accounting.Data;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Storage;

namespace FSH.Modules.Accounting.Services;

/// <summary>
/// Atomically reserves the next voucher number for the current tenant via a single
/// <c>UPDATE ... RETURNING</c> — the row lock and the read of the new value happen in one round
/// trip, so there's no separate <c>SELECT ... FOR UPDATE</c> step to get wrong (root plan §5's
/// "posting-lock ordering" note). Runs as a raw ADO command against the DbContext's own shared
/// connection so it enlists in whatever transaction is already open on it — including one the
/// caller began itself, or one it joined via the ambient-transaction pattern (SPIKE-0 /
/// eventing.md "Atomicity") when the caller is another module's DbContext sharing the connection.
///
/// This still needs the CALLER to run inside a <c>Serializable</c> transaction to get Postgres's
/// serialization-failure protection against the classic lost-update race under concurrent voucher
/// posting (root plan §10/§11) — that load test is tracked as a follow-up once SPIKE-0's
/// Testcontainers path is unblocked (see docs/pharmacy-modules-plan.md §2).
/// </summary>
public sealed class AccountingVoucherSequenceService(AccountingDbContext dbContext) : IAccountingVoucherNumbers
{
    public async Task<int> ReserveNextNumberAsync(CancellationToken cancellationToken = default)
    {
        string? tenantId = dbContext.TenantInfo?.Id
            ?? throw new InvalidOperationException("No tenant resolved for this request.");

        var connection = dbContext.Database.GetDbConnection();
        bool openedHere = false;
        if (connection.State != System.Data.ConnectionState.Open)
        {
            await connection.OpenAsync(cancellationToken).ConfigureAwait(false);
            openedHere = true;
        }

        try
        {
            await using var command = connection.CreateCommand();
            command.Transaction = dbContext.Database.CurrentTransaction?.GetDbTransaction();
            command.CommandText = $"""
                UPDATE "{AccountingDbContext.Schema}"."VoucherSequences"
                SET "LastNumber" = "LastNumber" + 1
                WHERE "TenantId" = @tenantId
                RETURNING "LastNumber"
                """;

            var tenantParam = command.CreateParameter();
            tenantParam.ParameterName = "tenantId";
            tenantParam.Value = tenantId;
            command.Parameters.Add(tenantParam);

            object? result = await command.ExecuteScalarAsync(cancellationToken).ConfigureAwait(false);
            if (result is null)
            {
                throw new InvalidOperationException(
                    "No voucher sequence row found for this tenant — AccountingDbInitializer.SeedAsync should have created one.");
            }

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
}

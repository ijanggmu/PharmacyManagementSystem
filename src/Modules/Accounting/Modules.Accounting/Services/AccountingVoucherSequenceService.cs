using System.Globalization;
using FSH.Modules.Accounting.Data;
using FSH.Modules.Accounting.Domain;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Storage;

namespace FSH.Modules.Accounting.Services;

/// <summary>
/// Atomically reserves the next voucher number in a <see cref="VoucherSeries"/> for the current tenant via a
/// single upsert ... <c>RETURNING</c> — the row lock and the read of the new value happen in one round trip,
/// so there's no separate <c>SELECT ... FOR UPDATE</c> step to get wrong (root plan §5's "posting-lock
/// ordering" note). Runs as a raw ADO command against the DbContext's own shared connection so it enlists in
/// whatever transaction is already open on it — including one the caller began itself, or one it joined via
/// the ambient-transaction pattern (SPIKE-0 / eventing.md "Atomicity") when the caller is another module's
/// DbContext sharing the connection.
///
/// Each series has its own counter row per tenant, created on first use. A new row starts after the tenant's
/// legacy shared counter (<see cref="AccountingVoucherSequence.LegacySeries"/>), so a type-wise number can
/// never repeat a number issued before series existed, whatever its prefix.
/// </summary>
public sealed class AccountingVoucherSequenceService(AccountingDbContext dbContext) : IAccountingVoucherNumbers
{
    public async Task<int> ReserveNextNumberAsync(string series, CancellationToken cancellationToken = default)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(series);
        if (!VoucherSeries.All.Contains(series, StringComparer.Ordinal))
        {
            throw new ArgumentException($"Unknown voucher series '{series}'.", nameof(series));
        }

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
            // Upsert, so a series' first voucher gets a number without any seeding. ON CONFLICT relies on the
            // unique index on ("TenantId", "Series"); the conflicting row is locked and incremented in the same
            // statement. A new row starts after the legacy shared counter (Series = ''), which is never bumped.
            command.CommandText = $"""
                INSERT INTO "{AccountingDbContext.Schema}"."VoucherSequences" AS s ("Id", "TenantId", "Series", "LastNumber")
                VALUES (
                    gen_random_uuid(), @tenantId, @series,
                    COALESCE((SELECT l."LastNumber" FROM "{AccountingDbContext.Schema}"."VoucherSequences" l
                              WHERE l."TenantId" = @tenantId AND l."Series" = ''), 0) + 1)
                ON CONFLICT ("TenantId", "Series") DO UPDATE SET "LastNumber" = s."LastNumber" + 1
                RETURNING "LastNumber"
                """;

            var tenantParam = command.CreateParameter();
            tenantParam.ParameterName = "tenantId";
            tenantParam.Value = tenantId;
            command.Parameters.Add(tenantParam);

            var seriesParam = command.CreateParameter();
            seriesParam.ParameterName = "series";
            seriesParam.Value = series;
            command.Parameters.Add(seriesParam);

            object? result = await command.ExecuteScalarAsync(cancellationToken).ConfigureAwait(false);
            if (result is null)
            {
                throw new InvalidOperationException(
                    "The voucher sequence upsert returned no number for this tenant.");
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

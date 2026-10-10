using System.Globalization;
using FSH.Modules.Prescriptions.Data;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Storage;

namespace FSH.Modules.Prescriptions.Services;

/// <summary>
/// Reserves the next "RX-" prescription number for the current tenant. The first use inserts the
/// tenant's counter row (ON CONFLICT DO NOTHING), then a single <c>UPDATE ... RETURNING</c> locks and
/// increments it, so concurrent creates get distinct numbers without a separate SELECT ... FOR UPDATE.
/// Runs on the DbContext's shared connection, like <c>AccountingVoucherSequenceService</c>.
/// </summary>
public sealed class PrescriptionNumberService(PrescriptionsDbContext dbContext)
{
    public async Task<string> ReserveNextAsync(CancellationToken cancellationToken = default)
    {
        string tenantId = dbContext.TenantInfo?.Id
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
            var transaction = dbContext.Database.CurrentTransaction?.GetDbTransaction();

            await using (var insert = connection.CreateCommand())
            {
                insert.Transaction = transaction;
                insert.CommandText = $"""
                    INSERT INTO "{PrescriptionsDbContext.Schema}"."PrescriptionNumberSequences" ("Id", "TenantId", "LastNumber")
                    VALUES (gen_random_uuid(), @tenantId, 0)
                    ON CONFLICT ("TenantId") DO NOTHING
                    """;
                AddTenant(insert, tenantId);
                await insert.ExecuteNonQueryAsync(cancellationToken).ConfigureAwait(false);
            }

            await using var update = connection.CreateCommand();
            update.Transaction = transaction;
            update.CommandText = $"""
                UPDATE "{PrescriptionsDbContext.Schema}"."PrescriptionNumberSequences"
                SET "LastNumber" = "LastNumber" + 1
                WHERE "TenantId" = @tenantId
                RETURNING "LastNumber"
                """;
            AddTenant(update, tenantId);

            object? result = await update.ExecuteScalarAsync(cancellationToken).ConfigureAwait(false);
            if (result is null)
            {
                throw new InvalidOperationException("Prescription number sequence row could not be created for this tenant.");
            }

            int number = Convert.ToInt32(result, CultureInfo.InvariantCulture);
            return "RX-" + number.ToString(CultureInfo.InvariantCulture);
        }
        finally
        {
            if (openedHere && dbContext.Database.CurrentTransaction is null)
            {
                await connection.CloseAsync().ConfigureAwait(false);
            }
        }
    }

    private static void AddTenant(System.Data.Common.DbCommand command, string tenantId)
    {
        var parameter = command.CreateParameter();
        parameter.ParameterName = "tenantId";
        parameter.Value = tenantId;
        command.Parameters.Add(parameter);
    }
}

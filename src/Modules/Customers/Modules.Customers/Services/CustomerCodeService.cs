using System.Data;
using System.Data.Common;
using System.Globalization;
using FSH.Modules.Customers.Data;
using FSH.Modules.Customers.Domain;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Storage;

namespace FSH.Modules.Customers.Services;

/// <summary>Issues the next customer number (card code) for the current tenant.</summary>
public interface ICustomerCodeService
{
    Task<string> NextAsync(CancellationToken cancellationToken = default);
}

/// <summary>
/// Tenant-wide counter in <c>customers.NumberSequences</c> (series <see cref="CustomerSeries.Customer"/>,
/// branch <see cref="Guid.Empty"/>, fiscal year 0), advanced with the same atomic
/// <c>UPDATE ... RETURNING</c> as the receipt series, so concurrent sign-ups never share a number.
/// Codes need not be gapless: a failed create simply skips one.
/// </summary>
public sealed class CustomerCodeService(CustomersDbContext dbContext) : ICustomerCodeService
{
    public const string Prefix = "C-";

    public static string Format(int sequence) =>
        string.Create(CultureInfo.InvariantCulture, $"{Prefix}{sequence:D6}");

    public async Task<string> NextAsync(CancellationToken cancellationToken = default)
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
                    INSERT INTO "{CustomersDbContext.Schema}"."NumberSequences" ("Id", "TenantId", "BranchId", "Series", "FiscalYear", "LastNumber")
                    VALUES (gen_random_uuid(), @tenantId, @branchId, @series, 0, 0)
                    ON CONFLICT ("TenantId", "BranchId", "Series", "FiscalYear") DO NOTHING
                    """;
                AddParameters(insert, tenantId);
                await insert.ExecuteNonQueryAsync(cancellationToken).ConfigureAwait(false);
            }

            await using var update = connection.CreateCommand();
            update.Transaction = transaction;
            update.CommandText = $"""
                UPDATE "{CustomersDbContext.Schema}"."NumberSequences"
                SET "LastNumber" = "LastNumber" + 1
                WHERE "TenantId" = @tenantId AND "BranchId" = @branchId AND "Series" = @series AND "FiscalYear" = 0
                RETURNING "LastNumber"
                """;
            AddParameters(update, tenantId);

            object? result = await update.ExecuteScalarAsync(cancellationToken).ConfigureAwait(false)
                ?? throw new InvalidOperationException("Customer number sequence row could not be created.");
            return Format(Convert.ToInt32(result, CultureInfo.InvariantCulture));
        }
        finally
        {
            if (openedHere && dbContext.Database.CurrentTransaction is null)
            {
                await connection.CloseAsync().ConfigureAwait(false);
            }
        }
    }

    private static void AddParameters(DbCommand command, string tenantId)
    {
        Add(command, "tenantId", tenantId);
        Add(command, "branchId", Guid.Empty);
        Add(command, "series", CustomerSeries.Customer);
    }

    private static void Add(DbCommand command, string name, object value)
    {
        var parameter = command.CreateParameter();
        parameter.ParameterName = name;
        parameter.Value = value;
        command.Parameters.Add(parameter);
    }
}

using System.Data;
using System.Data.Common;
using System.Globalization;
using FSH.Modules.Multitenancy.Contracts.v1.GetBranchById;
using FSH.Modules.Sales.Contracts.Fiscal;
using FSH.Modules.Suppliers.Data;
using FSH.Modules.Suppliers.Domain;
using Mediator;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Storage;

namespace FSH.Modules.Suppliers.Services;

/// <summary>Serial numbering for debit notes (abstracted so InMemory handler tests can substitute it).</summary>
public interface ISupplierDebitNoteNumberService
{
    /// <summary>Branch code for the number; resolve before opening the return's transaction.</summary>
    Task<string> ResolveBranchCodeAsync(Guid branchId, CancellationToken cancellationToken = default);

    /// <summary>Next serial for (tenant, branch, fiscal year); call inside the return's transaction.</summary>
    Task<int> ReserveNextAsync(Guid branchId, int fiscalYear, CancellationToken cancellationToken = default);
}

/// <summary><c>DN-{branchCode}-{fiscalYear}-{n:D5}</c>, e.g. <c>DN-MAIN-2083/84-00001</c>.</summary>
public sealed class SupplierDebitNoteNumberService(SuppliersDbContext dbContext, IMediator mediator) : ISupplierDebitNoteNumberService
{
    public static string Format(string branchCode, int fiscalYear, int sequence) =>
        string.Create(
            CultureInfo.InvariantCulture,
            $"{SupplierSeries.DebitNote}-{branchCode}-{NepalFiscalYear.Label(fiscalYear)}-{sequence:D5}");

    public async Task<string> ResolveBranchCodeAsync(Guid branchId, CancellationToken cancellationToken = default)
    {
        var branch = await mediator.Send(new GetBranchByIdQuery(branchId), cancellationToken).ConfigureAwait(false);
        return branch.Code.Trim().ToUpperInvariant();
    }

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
                    INSERT INTO "{SuppliersDbContext.Schema}"."NumberSequences" ("Id", "TenantId", "BranchId", "Series", "FiscalYear", "LastNumber")
                    VALUES (gen_random_uuid(), @tenantId, @branchId, @series, @fiscalYear, 0)
                    ON CONFLICT ("TenantId", "BranchId", "Series", "FiscalYear") DO NOTHING
                    """;
                AddParameters(insert, tenantId, branchId, fiscalYear);
                await insert.ExecuteNonQueryAsync(cancellationToken).ConfigureAwait(false);
            }

            await using var update = connection.CreateCommand();
            update.Transaction = transaction;
            update.CommandText = $"""
                UPDATE "{SuppliersDbContext.Schema}"."NumberSequences"
                SET "LastNumber" = "LastNumber" + 1
                WHERE "TenantId" = @tenantId AND "BranchId" = @branchId AND "Series" = @series AND "FiscalYear" = @fiscalYear
                RETURNING "LastNumber"
                """;
            AddParameters(update, tenantId, branchId, fiscalYear);

            object? result = await update.ExecuteScalarAsync(cancellationToken).ConfigureAwait(false)
                ?? throw new InvalidOperationException("Debit note number sequence row could not be created.");
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
        Add(command, "series", SupplierSeries.DebitNote);
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

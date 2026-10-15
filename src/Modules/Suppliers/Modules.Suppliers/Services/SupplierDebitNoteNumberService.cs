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

/// <summary>Serial numbering for payments made to suppliers (abstracted so InMemory handler tests can substitute it).</summary>
public interface ISupplierPaymentNumberService
{
    /// <summary>Branch code for the number; resolve before opening the payment's transaction.</summary>
    Task<string> ResolveBranchCodeAsync(Guid branchId, CancellationToken cancellationToken = default);

    /// <summary>Next serial for (tenant, branch, fiscal year); call inside the payment's transaction.</summary>
    Task<int> ReserveNextAsync(Guid branchId, int fiscalYear, CancellationToken cancellationToken = default);
}

/// <summary><c>DN-{branchCode}-{fiscalYear}-{n:D5}</c>, e.g. <c>DN-MAIN-2083/84-00001</c>.</summary>
public sealed class SupplierDebitNoteNumberService(SuppliersDbContext dbContext, IMediator mediator) : ISupplierDebitNoteNumberService
{
    public static string Format(string branchCode, int fiscalYear, int sequence) =>
        SupplierNumberSequenceStore.Format(SupplierSeries.DebitNote, branchCode, fiscalYear, sequence);

    public Task<string> ResolveBranchCodeAsync(Guid branchId, CancellationToken cancellationToken = default) =>
        SupplierNumberSequenceStore.ResolveBranchCodeAsync(mediator, branchId, cancellationToken);

    public Task<int> ReserveNextAsync(Guid branchId, int fiscalYear, CancellationToken cancellationToken = default) =>
        SupplierNumberSequenceStore.ReserveNextAsync(dbContext, branchId, SupplierSeries.DebitNote, fiscalYear, cancellationToken);
}

/// <summary>
/// <c>SPM-{branchCode}-{fiscalYear}-{n:D5}</c>, e.g. <c>SPM-MAIN-2083/84-00001</c> — the supplier-side counterpart
/// of the customer receipt series (RCP-…). Restarts every Nepali fiscal year, runs per branch; a rolled-back
/// payment releases its number.
/// </summary>
public sealed class SupplierPaymentNumberService(SuppliersDbContext dbContext, IMediator mediator) : ISupplierPaymentNumberService
{
    public static string Format(string branchCode, int fiscalYear, int sequence) =>
        SupplierNumberSequenceStore.Format(SupplierSeries.Payment, branchCode, fiscalYear, sequence);

    public Task<string> ResolveBranchCodeAsync(Guid branchId, CancellationToken cancellationToken = default) =>
        SupplierNumberSequenceStore.ResolveBranchCodeAsync(mediator, branchId, cancellationToken);

    public Task<int> ReserveNextAsync(Guid branchId, int fiscalYear, CancellationToken cancellationToken = default) =>
        SupplierNumberSequenceStore.ReserveNextAsync(dbContext, branchId, SupplierSeries.Payment, fiscalYear, cancellationToken);
}

/// <summary>The per-(tenant, branch, series, fiscal year) counters behind the supplier document series.</summary>
internal static class SupplierNumberSequenceStore
{
    public static string Format(string series, string branchCode, int fiscalYear, int sequence) =>
        string.Create(
            CultureInfo.InvariantCulture,
            $"{series}-{branchCode}-{NepalFiscalYear.Label(fiscalYear)}-{sequence:D5}");

    public static async Task<string> ResolveBranchCodeAsync(IMediator mediator, Guid branchId, CancellationToken cancellationToken)
    {
        var branch = await mediator.Send(new GetBranchByIdQuery(branchId), cancellationToken).ConfigureAwait(false);
        return branch.Code.Trim().ToUpperInvariant();
    }

    public static async Task<int> ReserveNextAsync(
        SuppliersDbContext dbContext, Guid branchId, string series, int fiscalYear, CancellationToken cancellationToken)
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
                AddParameters(insert, tenantId, branchId, series, fiscalYear);
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
            AddParameters(update, tenantId, branchId, series, fiscalYear);

            object? result = await update.ExecuteScalarAsync(cancellationToken).ConfigureAwait(false)
                ?? throw new InvalidOperationException($"The {series} number sequence row could not be created.");
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

    private static void AddParameters(DbCommand command, string tenantId, Guid branchId, string series, int fiscalYear)
    {
        Add(command, "tenantId", tenantId);
        Add(command, "branchId", branchId);
        Add(command, "series", series);
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

using System.Globalization;
using FSH.Modules.Multitenancy.Contracts.v1.GetBranchById;
using FSH.Modules.Reference.Contracts.v1.Settings;
using FSH.Modules.Sales.Contracts.Fiscal;
using FSH.Modules.Sales.Data;
using Mediator;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Storage;

namespace FSH.Modules.Sales.Services;

/// <summary>What a sale needs to be numbered, resolved before its transaction opens (the branch and
/// settings live in other modules, whose reads must not run on the sale's shared connection mid-transaction).</summary>
public sealed record InvoiceNumberContext(string Prefix, string BranchCode);

/// <summary>Sequential IRD invoice numbering (abstracted so handler unit tests on the InMemory provider,
/// which can't run the raw-SQL counter, can substitute it).</summary>
public interface IInvoiceNumberService
{
    Task<InvoiceNumberContext> ResolveContextAsync(Guid branchId, CancellationToken cancellationToken = default);

    Task<int> ReserveNextAsync(Guid branchId, int fiscalYear, CancellationToken cancellationToken = default);

    /// <summary>Next credit-note number — a separate series from invoices, same per-branch/per-year rules.</summary>
    Task<int> ReserveNextCreditNoteAsync(Guid branchId, int fiscalYear, CancellationToken cancellationToken = default);
}

/// <summary>
/// Reserves sequential IRD invoice numbers: <c>{prefix}-{branchCode}-{fiscalYear}-{n:D5}</c>, e.g.
/// <c>INV-MAIN-2083/84-00001</c>. The counter restarts every Nepali fiscal year and runs separately per
/// branch. The first use inserts the (branch, year) counter row (ON CONFLICT DO NOTHING), then one
/// <c>UPDATE ... RETURNING</c> locks and increments it on the caller's transaction, so concurrent sales
/// get distinct numbers and a rolled-back sale releases its number (no gaps in the IRD sequence).
/// </summary>
public sealed class InvoiceNumberService(SalesDbContext dbContext, IMediator mediator) : IInvoiceNumberService
{
    public async Task<InvoiceNumberContext> ResolveContextAsync(Guid branchId, CancellationToken cancellationToken = default)
    {
        var settings = await mediator.Send(new GetPharmacySettingsQuery(), cancellationToken).ConfigureAwait(false);
        var branch = await mediator.Send(new GetBranchByIdQuery(branchId), cancellationToken).ConfigureAwait(false);
        string prefix = string.IsNullOrWhiteSpace(settings.InvoiceNumberPrefix) ? "INV" : settings.InvoiceNumberPrefix.Trim().TrimEnd('-');
        return new InvoiceNumberContext(prefix, branch.Code.Trim().ToUpperInvariant());
    }

    public static string Format(InvoiceNumberContext context, int fiscalYear, int sequence)
    {
        ArgumentNullException.ThrowIfNull(context);
        return string.Create(
            CultureInfo.InvariantCulture,
            $"{context.Prefix}-{context.BranchCode}-{NepalFiscalYear.Label(fiscalYear)}-{sequence:D5}");
    }

    /// <summary>Credit-note number, e.g. <c>CN-MAIN-2083/84-00001</c> — always the CN series prefix.</summary>
    public static string FormatCreditNote(InvoiceNumberContext context, int fiscalYear, int sequence)
    {
        ArgumentNullException.ThrowIfNull(context);
        return string.Create(
            CultureInfo.InvariantCulture,
            $"{Domain.InvoiceSeries.CreditNote}-{context.BranchCode}-{NepalFiscalYear.Label(fiscalYear)}-{sequence:D5}");
    }

    /// <summary>Next invoice number for (current tenant, <paramref name="branchId"/>, <paramref name="fiscalYear"/>).
    /// Call inside the transaction that saves the sale.</summary>
    public Task<int> ReserveNextAsync(Guid branchId, int fiscalYear, CancellationToken cancellationToken = default) =>
        ReserveAsync(branchId, Domain.InvoiceSeries.Invoice, fiscalYear, cancellationToken);

    /// <summary>Next credit-note number. Call inside the transaction that saves the refund.</summary>
    public Task<int> ReserveNextCreditNoteAsync(Guid branchId, int fiscalYear, CancellationToken cancellationToken = default) =>
        ReserveAsync(branchId, Domain.InvoiceSeries.CreditNote, fiscalYear, cancellationToken);

    private async Task<int> ReserveAsync(Guid branchId, string series, int fiscalYear, CancellationToken cancellationToken)
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
                    INSERT INTO "{SalesDbContext.Schema}"."InvoiceNumberSequences" ("Id", "TenantId", "BranchId", "Series", "FiscalYear", "LastNumber")
                    VALUES (gen_random_uuid(), @tenantId, @branchId, @series, @fiscalYear, 0)
                    ON CONFLICT ("TenantId", "BranchId", "Series", "FiscalYear") DO NOTHING
                    """;
                AddParameters(insert, tenantId, branchId, series, fiscalYear);
                await insert.ExecuteNonQueryAsync(cancellationToken).ConfigureAwait(false);
            }

            await using var update = connection.CreateCommand();
            update.Transaction = transaction;
            update.CommandText = $"""
                UPDATE "{SalesDbContext.Schema}"."InvoiceNumberSequences"
                SET "LastNumber" = "LastNumber" + 1
                WHERE "TenantId" = @tenantId AND "BranchId" = @branchId AND "Series" = @series AND "FiscalYear" = @fiscalYear
                RETURNING "LastNumber"
                """;
            AddParameters(update, tenantId, branchId, series, fiscalYear);

            object? result = await update.ExecuteScalarAsync(cancellationToken).ConfigureAwait(false)
                ?? throw new InvalidOperationException("Invoice number sequence row could not be created.");
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

    private static void AddParameters(System.Data.Common.DbCommand command, string tenantId, Guid branchId, string series, int fiscalYear)
    {
        Add(command, "tenantId", tenantId);
        Add(command, "branchId", branchId);
        Add(command, "series", series);
        Add(command, "fiscalYear", fiscalYear);
    }

    private static void Add(System.Data.Common.DbCommand command, string name, object value)
    {
        var parameter = command.CreateParameter();
        parameter.ParameterName = name;
        parameter.Value = value;
        command.Parameters.Add(parameter);
    }
}

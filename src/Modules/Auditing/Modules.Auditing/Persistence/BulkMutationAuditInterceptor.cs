using System.Data.Common;
using System.Text.RegularExpressions;
using FSH.Modules.Auditing.Contracts;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Diagnostics;

namespace FSH.Modules.Auditing.Persistence;

/// <summary>
/// Captures set-based mutations that never reach <c>SaveChanges</c>: <c>ExecuteUpdate</c> /
/// <c>ExecuteDelete</c>, and raw <c>UPDATE</c>/<c>DELETE</c> issued through <c>ExecuteSql</c>. The
/// <see cref="AuditingSaveChangesInterceptor"/> only sees the change tracker, so without this these writes
/// left no entity-level audit trail (only the HTTP activity record of the request that caused them).
///
/// <para>Each such statement emits one <see cref="EntityChangeEventPayload"/> with
/// <see cref="EntityOperation.BulkUpdate"/> / <see cref="EntityOperation.BulkDelete"/>, the target table and
/// the number of rows affected. No per-row values are captured: the statement is set-based, so there is
/// nothing row-level to diff. SaveChanges statements are excluded by <see cref="CommandSource"/> so a
/// tracked change is not reported twice.</para>
/// </summary>
public sealed partial class BulkMutationAuditInterceptor(IAuditPublisher publisher, TimeProvider timeProvider)
    : DbCommandInterceptor
{
    private static readonly string[] QuoteChars = ["\"", "[", "]", "`"];

    public override async ValueTask<int> NonQueryExecutedAsync(
        DbCommand command,
        CommandExecutedEventData eventData,
        int result,
        CancellationToken cancellationToken = default)
    {
        ArgumentNullException.ThrowIfNull(command);
        ArgumentNullException.ThrowIfNull(eventData);

        var context = eventData.Context;
        if (context is null)
        {
            return result;
        }

        // Never audit the audit store's own writes (same guard as AuditingSaveChangesInterceptor).
        if (context is AuditDbContext || eventData.CommandSource == CommandSource.SaveChanges)
        {
            return result;
        }

        var target = ParseTarget(command.CommandText);
        if (target is null)
        {
            return result;
        }

        var (operation, schema, table) = target.Value;
        var payload = new EntityChangeEventPayload(
            DbContext: context.GetType().Name,
            Schema: schema,
            Table: table,
            EntityName: table,
            Key: $"rowsAffected:{result}",
            Operation: operation,
            Changes: [],
            TransactionId: context.Database.CurrentTransaction?.TransactionId.ToString());

        var now = timeProvider.GetUtcNow().UtcDateTime;
        var envelope = new AuditEnvelope(
            id: Guid.CreateVersion7(),
            occurredAtUtc: now,
            receivedAtUtc: now,
            eventType: AuditEventType.EntityChange,
            severity: AuditSeverity.Information,
            tenantId: null, userId: null, userName: null,
            traceId: null, spanId: null, correlationId: null, requestId: null,
            source: context.GetType().Name,
            tags: AuditTag.None,
            payload: payload);

        await publisher.PublishAsync(envelope, cancellationToken).ConfigureAwait(false);
        return result;
    }

    /// <summary>Extracts the operation and target table from a leading UPDATE/DELETE statement, or null.</summary>
    internal static (EntityOperation Operation, string? Schema, string Table)? ParseTarget(string? commandText)
    {
        if (string.IsNullOrWhiteSpace(commandText))
        {
            return null;
        }

        var match = StatementRegex().Match(commandText);
        if (!match.Success)
        {
            return null;
        }

        var operation = string.Equals(match.Groups["op"].Value, "DELETE", StringComparison.OrdinalIgnoreCase)
            ? EntityOperation.BulkDelete
            : EntityOperation.BulkUpdate;

        var parts = match.Groups["name"].Value
            .Split('.')
            .Select(StripQuotes)
            .ToArray();

        return parts.Length switch
        {
            1 => (operation, null, parts[0]),
            2 => (operation, parts[0], parts[1]),
            _ => (operation, parts[^2], parts[^1]),
        };
    }

    private static string StripQuotes(string part)
    {
        var value = part.Trim();
        foreach (var quote in QuoteChars)
        {
            value = value.Replace(quote, string.Empty, StringComparison.Ordinal);
        }

        return value;
    }

    [GeneratedRegex(
        @"^\s*(?<op>UPDATE|DELETE)\s+(?:FROM\s+)?(?<name>(?:""[^""]+""|\[[^\]]+\]|`[^`]+`|[\w$]+)(?:\s*\.\s*(?:""[^""]+""|\[[^\]]+\]|`[^`]+`|[\w$]+))*)",
        RegexOptions.IgnoreCase | RegexOptions.CultureInvariant)]
    private static partial Regex StatementRegex();
}

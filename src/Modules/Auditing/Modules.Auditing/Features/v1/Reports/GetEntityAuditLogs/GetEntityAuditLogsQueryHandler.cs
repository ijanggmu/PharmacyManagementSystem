using FSH.Framework.Core.Context;
using FSH.Framework.Core.Exceptions;
using FSH.Framework.Persistence;
using FSH.Framework.Shared.Persistence;
using FSH.Modules.Auditing.Contracts;
using FSH.Modules.Auditing.Contracts.Authorization;
using FSH.Modules.Auditing.Contracts.Dtos;
using FSH.Modules.Auditing.Contracts.v1.Reports.GetEntityAuditLogs;
using FSH.Modules.Auditing.Persistence;
using FSH.Modules.Identity.Contracts.Services;
using Mediator;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;
using System.Text.Json;
using static FSH.Modules.Auditing.Persistence.AuditJsonbFunctions;

namespace FSH.Modules.Auditing.Features.v1.Reports.GetEntityAuditLogs;

/// <summary>
/// .NET port of the Next.js reference's <c>listAuditLogs</c>. See
/// <see cref="GetEntityAuditLogsQuery"/> for how this differs from the generic
/// <c>Modules.Auditing.Contracts.v1.GetAudits.GetAuditsQuery</c>.
/// </summary>
public sealed class GetEntityAuditLogsQueryHandler(
    AuditDbContext dbContext,
    ICurrentUser currentUser,
    IUserPermissionService permissions,
    ILogger<GetEntityAuditLogsQueryHandler> logger)
    : IQueryHandler<GetEntityAuditLogsQuery, PagedResponse<EntityAuditLogDto>>
{
    public async ValueTask<PagedResponse<EntityAuditLogDto>> Handle(
        GetEntityAuditLogsQuery query, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(query);

        // Tenant-scoped by default (Finbuckle's automatic filter). A root support user may read one other
        // tenant's trail (tenant detail page) — same gate as GetAuditsQueryHandler.BuildBaseQueryAsync.
        var baseQuery = await BuildBaseQueryAsync(query.TenantId, cancellationToken).ConfigureAwait(false);
        var records = baseQuery.Where(a => a.EventType == (int)AuditEventType.EntityChange);

        // Case-insensitive substring match on the extracted jsonb table name OR the CLR entity name, so
        // "sale" finds Sales/SaleItems and "Medicine" finds the "medicines" table. (An exact-only match
        // returned nothing unless the user typed the physical table name verbatim.)
        if (!string.IsNullOrWhiteSpace(query.TableName))
        {
            string pattern = $"%{EscapeLike(query.TableName.Trim())}%";
            records = records.Where(a =>
                EF.Functions.ILike(JsonText(a.PayloadJson, "table")!, pattern, "\\")
                || EF.Functions.ILike(JsonText(a.PayloadJson, "entityName")!, pattern, "\\"));
        }

        if (!string.IsNullOrWhiteSpace(query.Action))
        {
            // Operation is stored as the enum name (Insert/Update/Delete…); callers send INSERT/UPDATE/DELETE.
            string operation = EscapeLike(query.Action.Trim());
            records = records.Where(a => EF.Functions.ILike(JsonText(a.PayloadJson, "operation")!, operation, "\\"));
        }

        if (query.FromUtc.HasValue)
        {
            records = records.Where(a => a.OccurredAtUtc >= query.FromUtc.Value);
        }

        if (query.ToUtc.HasValue)
        {
            records = records.Where(a => a.OccurredAtUtc <= query.ToUtc.Value);
        }

        records = records.OrderByDescending(a => a.OccurredAtUtc);

        var page = await records.ToPagedResponseAsync(query, cancellationToken).ConfigureAwait(false);

        var items = page.Items
            .Select(record =>
            {
                var (table, key, operation) = ParsePayload(record.PayloadJson, record.Id, logger);
                return new EntityAuditLogDto(
                    record.Id,
                    record.UserId,
                    table,
                    key,
                    operation,
                    record.OccurredAtUtc,
                    record.TenantId);
            })
            .ToList();

        return new PagedResponse<EntityAuditLogDto>
        {
            Items = items,
            PageNumber = page.PageNumber,
            PageSize = page.PageSize,
            TotalCount = page.TotalCount,
            TotalPages = page.TotalPages
        };
    }

    /// <summary>
    /// Own tenant (or the caller's own id passed explicitly) → the filtered set. A different tenant needs
    /// AuditTrails.ViewCrossTenant; the tenant filter is dropped and an explicit TenantId predicate is
    /// re-applied so this can never return every tenant's rows.
    /// </summary>
    private async Task<IQueryable<AuditRecord>> BuildBaseQueryAsync(string? tenantId, CancellationToken ct)
    {
        string? requested = string.IsNullOrWhiteSpace(tenantId) ? null : tenantId.Trim();
        bool wantsCrossTenant =
            requested is not null
            && !string.Equals(requested, currentUser.GetTenant(), StringComparison.OrdinalIgnoreCase);

        if (!wantsCrossTenant)
        {
            return dbContext.AuditRecords.AsNoTracking();
        }

        bool allowed = await permissions
            .HasPermissionAsync(currentUser.GetUserId().ToString(), AuditingPermissions.AuditTrails.ViewCrossTenant, ct)
            .ConfigureAwait(false);
        if (!allowed)
        {
            throw new ForbiddenException("Cross-tenant audit access requires Permissions.AuditTrails.ViewCrossTenant.");
        }

        return dbContext.AuditRecords
            .AsNoTracking()
            .IgnoreQueryFilters()
            .Where(a => a.TenantId == requested);
    }

    private static (string? Table, string? Key, string? Operation) ParsePayload(
        string payloadJson, Guid auditId, ILogger logger)
    {
        try
        {
            using var document = JsonDocument.Parse(payloadJson);
            var root = document.RootElement;
            string? table = root.TryGetProperty("table", out var t) ? t.GetString() : null;
            string? key = root.TryGetProperty("key", out var k) ? k.GetString() : null;
            string? operation = root.TryGetProperty("operation", out var o) ? o.GetString() : null;
            return (table, key, operation);
        }
        catch (JsonException ex)
        {
            logger.LogWarning(ex, "Failed to parse audit payload JSON for record {AuditId}.", auditId);
            return (null, null, null);
        }
    }

    private static string EscapeLike(string value) =>
        value.Replace("\\", "\\\\", StringComparison.Ordinal)
            .Replace("%", "\\%", StringComparison.Ordinal)
            .Replace("_", "\\_", StringComparison.Ordinal);
}

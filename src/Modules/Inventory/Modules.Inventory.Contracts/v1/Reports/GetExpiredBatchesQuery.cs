using FSH.Framework.Shared.Persistence;
using FSH.Modules.Inventory.Contracts.Dtos;
using Mediator;

namespace FSH.Modules.Inventory.Contracts.v1.Reports;

/// <summary>
/// Strictly-past-due batches still on hand and not yet disposed — the .NET equivalent of the
/// source system's GET /api/inventory/expired-batches (listExpiredBatchesForTenant). Differs from
/// <see cref="GetExpiringBatchesQuery"/> in shape and intent: that one is a configurable "expiring
/// within N days" look-ahead (and, at WithinDays=0, only loosely covers "already expired" by
/// including today); this one is a fixed "ExpiryDate is strictly before today" query with no
/// horizon parameter, matching the source's `.lt("expiry_date", today)` — a batch expiring today is
/// NOT included here (it isn't overdue yet).
///
/// Rows carry <see cref="ExpiredBatchDto.IsRecalled"/> so a lot that is expired *and* separately
/// recalled isn't silently lumped in with an ordinary expiry (a recall never write-offs stock, so a
/// recalled lot stays on hand and keeps showing up once it also expires). <see cref="IsRecalled"/>
/// optionally narrows the result to just recalled or just non-recalled rows — same optional-filter
/// pattern as the narcotic register's Schedule filter (Sales module).
/// </summary>
/// <param name="IsRecalled">Optional filter: <c>true</c> returns only recalled-and-expired batches,
/// <c>false</c> returns only expired batches that were never recalled, <c>null</c> (default) returns both.</param>
/// <param name="PageNumber">1-based page number (default 1).</param>
/// <param name="PageSize">Rows per page (default 50, max 200).</param>
/// <param name="BranchId">Optional branch; null = all branches the caller may see.</param>
public sealed record GetExpiredBatchesQuery(bool? IsRecalled = null, int PageNumber = 1, int PageSize = 50, Guid? BranchId = null)
    : IQuery<PagedResponse<ExpiredBatchDto>>;

using FSH.Modules.Onboarding.Contracts.Dtos;
using FSH.Modules.Onboarding.Contracts.v1.Migration;
using FSH.Modules.Onboarding.Data;
using Mediator;
using Microsoft.EntityFrameworkCore;

namespace FSH.Modules.Onboarding.Features.v1.Migration.GetMigrationSessionStatus;

/// <summary>Port of <c>getMigrationSession</c> — returns <c>null</c>, not 404, when no session has
/// been started yet.</summary>
public sealed class GetMigrationSessionStatusQueryHandler(OnboardingDbContext dbContext)
    : IQueryHandler<GetMigrationSessionStatusQuery, MigrationSessionStatusDto?>
{
    public async ValueTask<MigrationSessionStatusDto?> Handle(GetMigrationSessionStatusQuery query, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(query);

        var session = await dbContext.MigrationSessions
            .AsNoTracking()
            .FirstOrDefaultAsync(cancellationToken)
            .ConfigureAwait(false);

        if (session is null)
        {
            return null;
        }

        var lineItems = await dbContext.MigrationLineItems
            .AsNoTracking()
            .Where(l => l.SessionId == session.Id)
            .ToListAsync(cancellationToken)
            .ConfigureAwait(false);

        var categories = lineItems
            .GroupBy(l => l.Category)
            .Select(g => new MigrationCategorySummaryDto(
                g.Key.ToString(),
                g.Count(),
                g.Sum(l => l.Category == Domain.MigrationCategory.Stock
                    ? (l.Quantity ?? 0m) * (l.UnitCost ?? 0m)
                    : l.Amount ?? 0m)))
            .OrderBy(c => c.Category)
            .ToList();

        return new MigrationSessionStatusDto(
            session.Id,
            session.CutoverDate,
            session.Notes,
            session.Status.ToString(),
            session.CreatedAtUtc,
            session.CommittedAtUtc,
            session.CommittedBy,
            categories,
            session.BankVoucherId,
            session.CashVoucherId,
            session.CustomerVoucherId,
            session.SupplierVoucherId,
            session.StockVoucherId);
    }
}

using FSH.Modules.Accounting.Contracts.Dtos;
using FSH.Modules.Accounting.Data;
using FSH.Modules.Accounting.Domain;
using Microsoft.EntityFrameworkCore;

namespace FSH.Modules.Accounting.Features.v1.Reports.CashFlow;

/// <summary>Loads the chart and the tenant's cash flow tags, and classifies every account.</summary>
internal static class CashFlowClassifications
{
    public const string CashActivity = "Cash";

    public sealed record Snapshot(
        IReadOnlyList<CashFlowChartAccount> Accounts,
        IReadOnlyDictionary<Guid, CashFlowAccountClass> Classes);

    public static async Task<Snapshot> LoadAsync(AccountingDbContext dbContext, CancellationToken cancellationToken = default)
    {
        ArgumentNullException.ThrowIfNull(dbContext);

        var rows = await dbContext.Accounts
            .AsNoTracking()
            .Select(a => new { a.Id, a.Code, a.Name, a.AccountType, a.ParentId, a.IsSystem })
            .ToListAsync(cancellationToken)
            .ConfigureAwait(false);
        var accounts = rows
            .Select(a => new CashFlowChartAccount(
                a.Id, a.Code, a.Name, a.AccountType, a.ParentId,
                IsRootHead: a.ParentId == null && a.IsSystem && a.Code.Length == 1))
            .ToList();

        var tags = await dbContext.AccountCashFlowTags
            .AsNoTracking()
            .ToDictionaryAsync(t => t.AccountId, t => t.Activity, cancellationToken)
            .ConfigureAwait(false);

        return new Snapshot(accounts, CashFlowClassifier.Classify(accounts, tags));
    }

    public static IReadOnlyList<CashFlowClassificationDto> ToDtos(Snapshot snapshot)
    {
        ArgumentNullException.ThrowIfNull(snapshot);

        var parents = snapshot.Accounts.Where(a => a.ParentId is not null).Select(a => a.ParentId!.Value).ToHashSet();
        return snapshot.Accounts
            .Where(a => !a.IsRootHead)
            .OrderBy(a => a.Code, StringComparer.Ordinal)
            .Select(a =>
            {
                var cls = snapshot.Classes[a.Id];
                return new CashFlowClassificationDto(
                    a.Id,
                    a.Code,
                    a.Name,
                    a.Type.ToString(),
                    a.ParentId,
                    IsPostable: !parents.Contains(a.Id),
                    Tag: cls.Tag?.ToString(),
                    DefaultActivity: cls.IsCash ? CashActivity : cls.DefaultActivity.ToString(),
                    EffectiveActivity: cls.IsCash ? CashActivity : cls.Activity.ToString());
            })
            .ToList();
    }
}

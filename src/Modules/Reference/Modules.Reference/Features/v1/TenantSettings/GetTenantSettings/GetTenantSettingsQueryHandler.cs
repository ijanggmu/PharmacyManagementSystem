using FSH.Modules.Reference.Contracts.v1.TenantSettings;
using FSH.Modules.Reference.Data;
using Mediator;
using Microsoft.EntityFrameworkCore;

namespace FSH.Modules.Reference.Features.v1.TenantSettings.GetTenantSettings;

public sealed class GetTenantSettingsQueryHandler(ReferenceDbContext dbContext)
    : IQueryHandler<GetTenantSettingsQuery, Dictionary<string, string>>
{
    public async ValueTask<Dictionary<string, string>> Handle(GetTenantSettingsQuery query, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(query);

        var rows = await dbContext.TenantSettings
            .AsNoTracking()
            .Select(x => new { x.Key, x.Value })
            .ToListAsync(cancellationToken)
            .ConfigureAwait(false);

        // Few rows per tenant, and the category is derived from the key, so it is filtered in memory.
        string? category = string.IsNullOrWhiteSpace(query.Category) ? null : query.Category;
        return rows
            .Where(x => category is null || TenantSettingCategory.Matches(x.Key, category))
            .ToDictionary(x => x.Key, x => x.Value, StringComparer.Ordinal);
    }
}

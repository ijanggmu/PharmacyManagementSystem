using FSH.Framework.Core.Context;
using FSH.Modules.Accounting.Contracts.Dtos;
using FSH.Modules.Accounting.Contracts.v1.Tds;
using FSH.Modules.Accounting.Data;
using FSH.Modules.Accounting.Domain;
using FSH.Modules.Accounting.Services;
using Mediator;
using Microsoft.EntityFrameworkCore;

namespace FSH.Modules.Accounting.Features.v1.Tds.UpdateTdsCategories;

/// <summary>Upserts the given TDS categories by code. A default the tenant has no row for yet is stored with the
/// default's display order; a brand-new code goes after the existing ones.</summary>
public sealed class UpdateTdsCategoriesCommandHandler(AccountingDbContext dbContext, ICurrentUser currentUser)
    : ICommandHandler<UpdateTdsCategoriesCommand, IReadOnlyList<TdsCategoryDto>>
{
    public async ValueTask<IReadOnlyList<TdsCategoryDto>> Handle(UpdateTdsCategoriesCommand command, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(command);

        string actor = currentUser.Name ?? currentUser.GetUserId().ToString();
        var existing = await dbContext.TdsCategories.ToListAsync(cancellationToken).ConfigureAwait(false);
        int nextOrder = Math.Max(
            existing.Count == 0 ? 0 : existing.Max(c => c.SortOrder) + 1,
            TdsCategoryDefaults.All.Count);

        foreach (var input in command.Categories)
        {
            string code = TdsCategory.NormalizeCode(input.Code);
            var row = existing.Find(c => c.Code == code);
            if (row is not null)
            {
                row.Update(input.Name, input.RatePercent, input.IsActive, actor);
                continue;
            }

            int defaultIndex = TdsCategoryDefaults.All.ToList().FindIndex(d => d.Code == code);
            row = TdsCategory.Create(code, input.Name, input.RatePercent, defaultIndex >= 0 ? defaultIndex : nextOrder++, actor);
            if (!input.IsActive)
            {
                row.Update(input.Name, input.RatePercent, isActive: false, actor);
            }

            dbContext.TdsCategories.Add(row);
            existing.Add(row);
        }

        await dbContext.SaveChangesAsync(cancellationToken).ConfigureAwait(false);
        return await TdsCategoryCatalog.ListAsync(dbContext, cancellationToken).ConfigureAwait(false);
    }
}

using FSH.Framework.Core.Exceptions;
using FSH.Modules.Onboarding.Contracts.v1.Migration;
using FSH.Modules.Onboarding.Data;
using FSH.Modules.Onboarding.Domain;
using Mediator;
using Microsoft.EntityFrameworkCore;

namespace FSH.Modules.Onboarding.Features.v1.Migration.SaveDraftLines;

/// <summary>
/// Port of the per-category <c>app/api/migration/opening-*</c> routes, split into a "save the draft"
/// step (this handler) ahead of <c>CommitMigrationSessionCommand</c>'s actual posting. Saving a
/// category replaces whatever was previously saved for it — a pharmacy re-uploading its opening-stock
/// sheet after fixing a typo re-saves the whole category rather than appending duplicates.
/// </summary>
public sealed class SaveDraftLinesCommandHandler(OnboardingDbContext dbContext)
    : ICommandHandler<SaveDraftLinesCommand, int>
{
    public async ValueTask<int> Handle(SaveDraftLinesCommand command, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(command);

        var session = await dbContext.MigrationSessions
            .FirstOrDefaultAsync(s => s.Id == command.SessionId, cancellationToken)
            .ConfigureAwait(false)
            ?? throw new NotFoundException("Start a migration session first (set the cutover date).");

        session.EnsureDraft();

        var category = Enum.Parse<MigrationCategory>(command.Category, ignoreCase: true);

        var existing = await dbContext.MigrationLineItems
            .Where(l => l.SessionId == session.Id && l.Category == category)
            .ToListAsync(cancellationToken)
            .ConfigureAwait(false);
        dbContext.MigrationLineItems.RemoveRange(existing);

        var entities = category switch
        {
            MigrationCategory.Cash or MigrationCategory.Bank => command.Lines
                .Select(l => MigrationLineItem.CreateCashOrBank(session.Id, category, l.Amount!.Value, l.Description))
                .ToList(),

            MigrationCategory.Customer or MigrationCategory.Supplier => command.Lines
                .Select(l => MigrationLineItem.CreateParty(session.Id, category, l.PartyId!.Value, l.Amount!.Value, l.Description))
                .ToList(),

            MigrationCategory.Stock => command.Lines
                .Select(l => MigrationLineItem.CreateStock(
                    session.Id, l.MedicineId!.Value, l.Quantity!.Value, l.UnitCost!.Value, l.SellingPrice,
                    string.IsNullOrWhiteSpace(l.BatchNo) ? $"OPEN-{Guid.CreateVersion7():N}"[..16] : l.BatchNo,
                    l.ExpiryDate!.Value, l.Description))
                .ToList(),

            _ => throw new CustomException($"Unsupported migration category '{command.Category}'.", (IEnumerable<string>?)null, System.Net.HttpStatusCode.BadRequest),
        };

        dbContext.MigrationLineItems.AddRange(entities);
        await dbContext.SaveChangesAsync(cancellationToken).ConfigureAwait(false);

        return entities.Count;
    }
}

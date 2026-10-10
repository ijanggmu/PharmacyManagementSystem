using System.Net;
using FSH.Framework.Core.Context;
using FSH.Framework.Core.Exceptions;
using FSH.Modules.Onboarding.Contracts.v1.Migration;
using FSH.Modules.Onboarding.Data;
using FSH.Modules.Onboarding.Domain;
using Mediator;
using Microsoft.EntityFrameworkCore;

namespace FSH.Modules.Onboarding.Features.v1.Migration.StartMigrationSession;

/// <summary>Port of <c>startMigrationSession</c> — one session per tenant (tenant isolation on
/// <see cref="OnboardingDbContext"/> makes "first row for this tenant" equivalent to the Next.js
/// service's <c>eq("tenant_id", tenantId)</c> lookup).</summary>
public sealed class StartMigrationSessionCommandHandler(OnboardingDbContext dbContext, ICurrentUser currentUser)
    : ICommandHandler<StartMigrationSessionCommand, Guid>
{
    public async ValueTask<Guid> Handle(StartMigrationSessionCommand command, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(command);

        bool exists = await dbContext.MigrationSessions.AnyAsync(cancellationToken).ConfigureAwait(false);
        if (exists)
        {
            throw new CustomException(
                "A migration session already exists for this pharmacy.", (IEnumerable<string>?)null, HttpStatusCode.Conflict);
        }

        var session = MigrationSession.Create(
            command.CutoverDate, command.Notes, currentUser.Name ?? currentUser.GetUserId().ToString());

        dbContext.MigrationSessions.Add(session);
        await dbContext.SaveChangesAsync(cancellationToken).ConfigureAwait(false);

        return session.Id;
    }
}

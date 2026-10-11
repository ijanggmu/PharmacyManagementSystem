using FSH.Framework.Persistence;
using FSH.Modules.Onboarding.Domain;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;

namespace FSH.Modules.Onboarding.Data;

public sealed class OnboardingDbInitializer(
    OnboardingDbContext dbContext,
    ILogger<OnboardingDbInitializer> logger) : IDbInitializer
{
    public async Task MigrateAsync(CancellationToken cancellationToken)
    {
        if ((await dbContext.Database.GetPendingMigrationsAsync(cancellationToken).ConfigureAwait(false)).Any())
        {
            await dbContext.Database.MigrateAsync(cancellationToken).ConfigureAwait(false);
            logger.LogInformation("[Onboarding] applied migrations");
        }
    }

    /// <summary>Every tenant needs exactly one pending <see cref="OnboardingStatus"/> row so
    /// <c>CompleteOnboardingCommandHandler</c> never has to special-case "not yet created".</summary>
    public async Task SeedAsync(CancellationToken cancellationToken)
    {
        if (await dbContext.OnboardingStatuses.AnyAsync(cancellationToken).ConfigureAwait(false))
        {
            return;
        }

        dbContext.OnboardingStatuses.Add(OnboardingStatus.CreatePending());
        await dbContext.SaveChangesAsync(cancellationToken).ConfigureAwait(false);
        logger.LogInformation("[Onboarding] seeded pending onboarding status");
    }
}

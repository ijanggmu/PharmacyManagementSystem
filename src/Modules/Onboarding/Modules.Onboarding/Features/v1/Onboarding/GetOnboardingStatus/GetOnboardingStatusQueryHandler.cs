using FSH.Framework.Core.Exceptions;
using FSH.Modules.Onboarding.Contracts.Dtos;
using FSH.Modules.Onboarding.Contracts.v1.Onboarding;
using FSH.Modules.Onboarding.Data;
using Mediator;
using Microsoft.EntityFrameworkCore;

namespace FSH.Modules.Onboarding.Features.v1.Onboarding.GetOnboardingStatus;

public sealed class GetOnboardingStatusQueryHandler(OnboardingDbContext dbContext)
    : IQueryHandler<GetOnboardingStatusQuery, OnboardingStatusDto>
{
    public async ValueTask<OnboardingStatusDto> Handle(GetOnboardingStatusQuery query, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(query);

        var status = await dbContext.OnboardingStatuses
            .AsNoTracking()
            .FirstOrDefaultAsync(cancellationToken)
            .ConfigureAwait(false)
            ?? throw new NotFoundException("No onboarding status found for this tenant.");

        return new OnboardingStatusDto(status.Id, status.IsCompleted, status.OpeningBalanceVoucherId, status.CompletedAtUtc, status.CompletedBy);
    }
}

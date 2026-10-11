using FSH.Modules.Onboarding.Contracts.Dtos;
using Mediator;

namespace FSH.Modules.Onboarding.Contracts.v1.Onboarding;

public sealed record GetOnboardingStatusQuery : IQuery<OnboardingStatusDto>;

namespace FSH.Modules.Onboarding.Contracts.Dtos;

public sealed record OnboardingStatusDto(
    Guid Id,
    bool IsCompleted,
    Guid? OpeningBalanceVoucherId,
    DateTime? CompletedAtUtc,
    string? CompletedBy);

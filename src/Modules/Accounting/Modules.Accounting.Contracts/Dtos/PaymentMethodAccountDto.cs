namespace FSH.Modules.Accounting.Contracts.Dtos;

/// <summary>
/// Where one payment method's money posts: the mapped account, or the built-in default when the tenant
/// hasn't mapped it (<see cref="IsDefault"/>). <see cref="AccountId"/> is null only when the default
/// account is missing from the chart.
/// </summary>
public sealed record PaymentMethodAccountDto(
    string Method,
    Guid? AccountId,
    string? AccountCode,
    string? AccountName,
    bool IsDefault,
    string DefaultAccountCode);

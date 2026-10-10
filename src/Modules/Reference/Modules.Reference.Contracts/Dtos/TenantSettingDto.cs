namespace FSH.Modules.Reference.Contracts.Dtos;

public sealed record TenantSettingDto(string Key, string Value, DateTime UpdatedAtUtc);

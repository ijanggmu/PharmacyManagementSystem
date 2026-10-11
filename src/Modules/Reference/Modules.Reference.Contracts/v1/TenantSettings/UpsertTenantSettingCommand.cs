using FSH.Modules.Reference.Contracts.Dtos;
using Mediator;

namespace FSH.Modules.Reference.Contracts.v1.TenantSettings;

public sealed record UpsertTenantSettingCommand(string Key, string Value) : ICommand<TenantSettingDto>;

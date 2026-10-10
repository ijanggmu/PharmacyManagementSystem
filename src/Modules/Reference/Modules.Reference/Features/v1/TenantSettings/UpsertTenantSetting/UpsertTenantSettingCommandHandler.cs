using FSH.Modules.Reference.Contracts.Dtos;
using FSH.Modules.Reference.Contracts.v1.TenantSettings;
using FSH.Modules.Reference.Data;
using FSH.Modules.Reference.Domain;
using Mediator;
using Microsoft.EntityFrameworkCore;

namespace FSH.Modules.Reference.Features.v1.TenantSettings.UpsertTenantSetting;

public sealed class UpsertTenantSettingCommandHandler(ReferenceDbContext dbContext)
    : ICommandHandler<UpsertTenantSettingCommand, TenantSettingDto>
{
    public async ValueTask<TenantSettingDto> Handle(UpsertTenantSettingCommand command, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(command);

        var key = command.Key.Trim();
        var setting = await dbContext.TenantSettings
            .FirstOrDefaultAsync(x => x.Key == key, cancellationToken)
            .ConfigureAwait(false);

        if (setting is null)
        {
            setting = TenantSetting.Create(key, command.Value);
            dbContext.TenantSettings.Add(setting);
        }
        else
        {
            setting.UpdateValue(command.Value);
        }

        await dbContext.SaveChangesAsync(cancellationToken).ConfigureAwait(false);
        return new TenantSettingDto(setting.Key, setting.Value, setting.UpdatedAtUtc);
    }
}

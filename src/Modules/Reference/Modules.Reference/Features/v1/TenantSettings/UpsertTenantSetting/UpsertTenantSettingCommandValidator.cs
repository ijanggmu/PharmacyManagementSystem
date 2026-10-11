using FluentValidation;
using FSH.Modules.Reference.Contracts.v1.TenantSettings;

namespace FSH.Modules.Reference.Features.v1.TenantSettings.UpsertTenantSetting;

public sealed class UpsertTenantSettingCommandValidator : AbstractValidator<UpsertTenantSettingCommand>
{
    public UpsertTenantSettingCommandValidator()
    {
        RuleFor(x => x.Key)
            .NotEmpty()
            .Must(k => !string.IsNullOrWhiteSpace(k))
            .WithMessage("Key must not be whitespace.")
            .MaximumLength(100);
        RuleFor(x => x.Value).NotNull().MaximumLength(2000);
    }
}

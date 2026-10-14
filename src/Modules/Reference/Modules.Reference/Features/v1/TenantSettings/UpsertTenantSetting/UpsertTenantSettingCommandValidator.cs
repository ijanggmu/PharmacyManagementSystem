using System.Globalization;
using System.Text.Json;
using FluentValidation;
using FSH.Modules.Reference.Contracts.Controls;
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

        // The internal-control keys are read by Sales and Accounting; a value they can't read silently falls back to
        // a default there, so refuse it here instead. Other keys stay free-form.
        RuleFor(x => x.Value)
            .Must(IsBoolean)
            .When(x => IsKey(x, InternalControlSettings.RequireOpenShiftKey) || IsKey(x, InternalControlSettings.VoucherCreatorCannotPostKey))
            .WithMessage("This setting must be \"true\" or \"false\".");
        RuleFor(x => x.Value)
            .Must(IsNonNegativeNumber)
            .When(x => IsKey(x, InternalControlSettings.RefundApprovalThresholdKey))
            .WithMessage("The refund approval threshold must be a number of 0 or more.");
        RuleFor(x => x.Value)
            .Must(IsValidDiscountCaps)
            .When(x => IsKey(x, InternalControlSettings.DiscountCapsKey))
            .WithMessage("Discount caps must be JSON like {\"Cashier\": {\"line\": 5, \"bill\": 5}} with percents from 0 to 100 (or null for no cap).");
    }

    private static bool IsKey(UpsertTenantSettingCommand command, string key) =>
        string.Equals(command.Key?.Trim(), key, StringComparison.OrdinalIgnoreCase);

    internal static bool IsBoolean(string? value) =>
        string.Equals(value?.Trim(), "true", StringComparison.OrdinalIgnoreCase)
        || string.Equals(value?.Trim(), "false", StringComparison.OrdinalIgnoreCase);

    internal static bool IsNonNegativeNumber(string? value) =>
        decimal.TryParse(value?.Trim(), NumberStyles.Number, CultureInfo.InvariantCulture, out var number) && number >= 0m;

    /// <summary>The shape <see cref="InternalControlSettings.ParseDiscountCaps"/> reads: an object of role → { line, bill }.</summary>
    internal static bool IsValidDiscountCaps(string? value)
    {
        if (string.IsNullOrWhiteSpace(value))
        {
            return false;
        }

        try
        {
            using var document = JsonDocument.Parse(value);
            if (document.RootElement.ValueKind != JsonValueKind.Object)
            {
                return false;
            }

            foreach (var role in document.RootElement.EnumerateObject())
            {
                if (string.IsNullOrWhiteSpace(role.Name) || role.Value.ValueKind != JsonValueKind.Object)
                {
                    return false;
                }

                foreach (var cap in role.Value.EnumerateObject())
                {
                    bool knownName = string.Equals(cap.Name, "line", StringComparison.OrdinalIgnoreCase)
                        || string.Equals(cap.Name, "bill", StringComparison.OrdinalIgnoreCase);
                    bool validValue = cap.Value.ValueKind == JsonValueKind.Null
                        || (cap.Value.ValueKind == JsonValueKind.Number
                            && cap.Value.TryGetDecimal(out var percent)
                            && percent is >= 0m and <= 100m);
                    if (!knownName || !validValue)
                    {
                        return false;
                    }
                }
            }

            return true;
        }
        catch (JsonException)
        {
            return false;
        }
    }
}

using FluentValidation;
using FSH.Modules.Identity.Contracts.v1.ExternalLogins;

namespace FSH.Modules.Identity.Features.v1.ExternalLogins;

// Google ID tokens are ~1–2 KB JWTs; the cap only rejects junk before any key lookup.
internal static class GoogleIdTokenRules
{
    public const int MaxLength = 8192;
}

public sealed class GoogleTokenCommandValidator : AbstractValidator<GoogleTokenCommand>
{
    public GoogleTokenCommandValidator()
    {
        RuleFor(x => x.IdToken).NotEmpty().MaximumLength(GoogleIdTokenRules.MaxLength);
        RuleFor(x => x.TwoFactorCode).MaximumLength(16).When(x => x.TwoFactorCode is not null);
        RuleFor(x => x.RecoveryCode).MaximumLength(32).When(x => x.RecoveryCode is not null);
    }
}

public sealed class ResolveGoogleLoginQueryValidator : AbstractValidator<ResolveGoogleLoginQuery>
{
    public ResolveGoogleLoginQueryValidator()
    {
        RuleFor(x => x.IdToken).NotEmpty().MaximumLength(GoogleIdTokenRules.MaxLength);
    }
}

public sealed class VerifyGoogleSignUpQueryValidator : AbstractValidator<VerifyGoogleSignUpQuery>
{
    public VerifyGoogleSignUpQueryValidator()
    {
        RuleFor(x => x.IdToken).NotEmpty().MaximumLength(GoogleIdTokenRules.MaxLength);
    }
}

public sealed class ConnectGoogleLoginCommandValidator : AbstractValidator<ConnectGoogleLoginCommand>
{
    public ConnectGoogleLoginCommandValidator()
    {
        RuleFor(x => x.IdToken).NotEmpty().MaximumLength(GoogleIdTokenRules.MaxLength);
    }
}

/// <summary>No input — present because every command needs a validator.</summary>
public sealed class DisconnectGoogleLoginCommandValidator : AbstractValidator<DisconnectGoogleLoginCommand>;

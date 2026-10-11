using System.Security.Cryptography;
using FSH.Framework.Core.Exceptions;
using FSH.Modules.Identity.Contracts.Services;
using FSH.Modules.Identity.Contracts.v1.ExternalLogins;
using FSH.Modules.Multitenancy.Contracts.v1.CreateTenant;
using FSH.Modules.Multitenancy.Contracts.v1.SignUpTenant;
using Mediator;

namespace FSH.Modules.Multitenancy.Features.v1.SignUpTenant;

/// <summary>
/// Thin wrapper around <see cref="CreateTenantCommand"/> for anonymous self-service signup.
/// Deliberately reuses the existing tenant-creation command/handler rather than duplicating it —
/// uniqueness, connection-string and plan validation all run through
/// <c>CreateTenantCommandValidator</c> exactly as they do for an operator-driven create.
/// </summary>
/// <remarks>
/// <c>CreateTenantCommand</c> carries no admin name or phone, so they — and, for sign-up with Google, the
/// Google login to connect — are staged with Identity (<see cref="ITenantAdminProfileStaging"/>) before the
/// tenant is created; the Identity seed step applies them when it creates the admin user. Staging happens
/// first because provisioning can run inline. A Google sign-up gets a random strong password (the admin
/// signs in with Google; "Forgot password" can set a real one later), so the seed step never falls back to
/// the configured default password.
/// </remarks>
public sealed class SignUpTenantCommandHandler(
    IMediator mediator,
    IGoogleIdTokenValidator googleTokens,
    ITenantAdminProfileStaging adminProfileStaging)
    : ICommandHandler<SignUpTenantCommand, SignUpTenantCommandResponse>
{
    public async ValueTask<SignUpTenantCommandResponse> Handle(SignUpTenantCommand command, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(command);

        string adminEmail = command.AdminEmail.Trim();
        string password;
        GoogleIdentity? google = null;

        if (!string.IsNullOrWhiteSpace(command.GoogleIdToken))
        {
            google = await googleTokens.ValidateAsync(command.GoogleIdToken, cancellationToken).ConfigureAwait(false);
            if (!google.EmailVerified || !string.Equals(google.Email, adminEmail, StringComparison.OrdinalIgnoreCase))
            {
                throw new CustomException(
                    "The admin email must be the verified email of the Google account you signed up with.",
                    errors: null,
                    System.Net.HttpStatusCode.BadRequest);
            }

            password = GeneratePassword();
        }
        else
        {
            password = command.AdminPassword!;
        }

        await adminProfileStaging.StageAsync(
            new StagedTenantAdminProfile(
                TenantId: command.Slug,
                Email: adminEmail,
                FirstName: command.AdminFirstName,
                LastName: command.AdminLastName,
                PhoneNumber: command.PhoneNumber,
                ExternalLoginProvider: google is null ? null : ExternalLoginProviders.Google,
                ExternalProviderKey: google?.Subject,
                ExternalDisplayName: google?.Email),
            cancellationToken).ConfigureAwait(false);

        var result = await mediator.Send(
            new CreateTenantCommand(
                Id: command.Slug,
                Name: command.PharmacyName,
                ConnectionString: null,
                AdminEmail: adminEmail,
                AdminPassword: password,
                Issuer: null,
                PlanKey: null),
            cancellationToken).ConfigureAwait(false);

        return new SignUpTenantCommandResponse(result.Id, result.ProvisioningCorrelationId, result.Status);
    }

    /// <summary>32 random characters always including an upper, a lower and a digit (Identity's policy).</summary>
    public static string GeneratePassword()
    {
        const string upper = "ABCDEFGHJKLMNPQRSTUVWXYZ";
        const string lower = "abcdefghijkmnopqrstuvwxyz";
        const string digits = "23456789";
        const string all = upper + lower + digits;

        var chars = new char[32];
        chars[0] = upper[RandomNumberGenerator.GetInt32(upper.Length)];
        chars[1] = lower[RandomNumberGenerator.GetInt32(lower.Length)];
        chars[2] = digits[RandomNumberGenerator.GetInt32(digits.Length)];
        for (int i = 3; i < chars.Length; i++)
        {
            chars[i] = all[RandomNumberGenerator.GetInt32(all.Length)];
        }

        RandomNumberGenerator.Shuffle(chars.AsSpan());
        return new string(chars);
    }
}

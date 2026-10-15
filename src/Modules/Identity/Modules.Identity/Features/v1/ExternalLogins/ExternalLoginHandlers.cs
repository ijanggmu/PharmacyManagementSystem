using FSH.Framework.Core.Context;
using FSH.Framework.Core.Exceptions;
using FSH.Modules.Auditing.Contracts;
using FSH.Modules.Identity.Contracts.DTOs;
using FSH.Modules.Identity.Contracts.Services;
using FSH.Modules.Identity.Contracts.v1.ExternalLogins;
using FSH.Modules.Identity.Domain;
using FSH.Modules.Multitenancy.Contracts.Dtos;
using FSH.Modules.Multitenancy.Contracts.v1.GetTenantByCode;
using Mediator;
using Microsoft.AspNetCore.Identity;
using System.Net;
using System.Security.Claims;

namespace FSH.Modules.Identity.Features.v1.ExternalLogins;

/// <summary>Sign in with Google into the tenant from the <c>tenant</c> header. Only a Google account already
/// connected to a user of that tenant signs in — there is no linking by email.</summary>
public sealed class GoogleTokenCommandHandler(
    IGoogleIdTokenValidator googleTokens,
    IIdentityService identityService,
    LoginTokenIssuer issuer,
    ISecurityAudit securityAudit,
    IRequestContext requestContext) : ICommandHandler<GoogleTokenCommand, TokenResponse>
{
    public async ValueTask<TokenResponse> Handle(GoogleTokenCommand command, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(command);

        var google = await googleTokens.ValidateAsync(command.IdToken, cancellationToken).ConfigureAwait(false);

        (string Subject, IEnumerable<Claim> Claims) login;
        try
        {
            login = await identityService.ValidateExternalLoginAsync(
                ExternalLoginProviders.Google, google.Subject, command.TwoFactorCode, command.RecoveryCode, cancellationToken)
                .ConfigureAwait(false);
        }
        catch (UnauthorizedException ex) when (!ex.Message.StartsWith("two_factor", StringComparison.Ordinal))
        {
            await securityAudit.LoginFailedAsync(
                google.Email, requestContext.ClientId ?? "unknown", "GoogleLoginRejected", requestContext.IpAddress ?? "unknown", cancellationToken)
                .ConfigureAwait(false);
            throw;
        }

        return await issuer.IssueAsync(login.Subject, login.Claims, google.Email, cancellationToken).ConfigureAwait(false);
    }
}

/// <summary>Lists the active pharmacies a verified Google account is connected to.</summary>
public sealed class ResolveGoogleLoginQueryHandler(
    IGoogleIdTokenValidator googleTokens,
    IIdentityService identityService,
    IMediator mediator) : IQueryHandler<ResolveGoogleLoginQuery, GoogleLoginResolution>
{
    public async ValueTask<GoogleLoginResolution> Handle(ResolveGoogleLoginQuery query, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(query);

        var google = await googleTokens.ValidateAsync(query.IdToken, cancellationToken).ConfigureAwait(false);
        var tenantIds = await identityService
            .FindExternalLoginTenantsAsync(ExternalLoginProviders.Google, google.Subject, cancellationToken)
            .ConfigureAwait(false);

        var tenants = new List<GoogleLoginTenant>(tenantIds.Count);
        foreach (string tenantId in tenantIds.Order(StringComparer.Ordinal))
        {
            // Inactive or unknown tenants are left out (the lookup answers them with a 404).
            TenantLookupDto lookup;
            try
            {
                lookup = await mediator.Send(new GetTenantByCodeQuery(tenantId), cancellationToken).ConfigureAwait(false);
            }
            catch (NotFoundException)
            {
                continue;
            }

            if (lookup.Code is not null)
            {
                tenants.Add(new GoogleLoginTenant(lookup.Code, lookup.Name ?? lookup.Code));
            }
        }

        return new GoogleLoginResolution(google.Email, tenants);
    }
}

/// <summary>Verifies a Google account for sign-up and returns the profile to prefill the form with.</summary>
public sealed class VerifyGoogleSignUpQueryHandler(IGoogleIdTokenValidator googleTokens)
    : IQueryHandler<VerifyGoogleSignUpQuery, GoogleSignUpProfile>
{
    public async ValueTask<GoogleSignUpProfile> Handle(VerifyGoogleSignUpQuery query, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(query);

        var google = await googleTokens.ValidateAsync(query.IdToken, cancellationToken).ConfigureAwait(false);
        if (!google.EmailVerified)
        {
            throw new UnauthorizedException("google_email_unverified: This Google account's email address isn't verified.");
        }

        return new GoogleSignUpProfile(google.Email, google.GivenName, google.FamilyName, google.Picture);
    }
}

/// <summary>Connects a Google account to the signed-in user (explicit, never by email match).</summary>
public sealed class ConnectGoogleLoginCommandHandler(
    IGoogleIdTokenValidator googleTokens,
    UserManager<FshUser> userManager,
    ICurrentUser currentUser) : ICommandHandler<ConnectGoogleLoginCommand, ExternalLoginDto>
{
    public async ValueTask<ExternalLoginDto> Handle(ConnectGoogleLoginCommand command, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(command);

        var user = await ExternalLoginUsers.CurrentAsync(userManager, currentUser).ConfigureAwait(false);
        var google = await googleTokens.ValidateAsync(command.IdToken, cancellationToken).ConfigureAwait(false);

        // Tenant-filtered: is this Google account already connected to someone in this pharmacy?
        var owner = await userManager.FindByLoginAsync(ExternalLoginProviders.Google, google.Subject).ConfigureAwait(false);
        if (owner is not null)
        {
            if (owner.Id == user.Id)
            {
                return new ExternalLoginDto(ExternalLoginProviders.Google, google.Email);
            }

            throw new CustomException(
                "This Google account is already connected to another user in this pharmacy.", errors: null, HttpStatusCode.Conflict);
        }

        var existing = (await userManager.GetLoginsAsync(user).ConfigureAwait(false))
            .FirstOrDefault(l => l.LoginProvider == ExternalLoginProviders.Google);
        if (existing is not null)
        {
            throw new CustomException(
                $"A Google account ({existing.ProviderDisplayName}) is already connected. Disconnect it first.", errors: null, HttpStatusCode.Conflict);
        }

        var result = await userManager.AddLoginAsync(
            user, new UserLoginInfo(ExternalLoginProviders.Google, google.Subject, google.Email)).ConfigureAwait(false);
        if (!result.Succeeded)
        {
            throw new CustomException(
                "Couldn't connect the Google account.", result.Errors.Select(e => e.Description).ToList(), HttpStatusCode.BadRequest);
        }

        return new ExternalLoginDto(ExternalLoginProviders.Google, google.Email);
    }
}

/// <summary>Disconnects the signed-in user's Google account, unless it is their only way to sign in.</summary>
public sealed class DisconnectGoogleLoginCommandHandler(UserManager<FshUser> userManager, ICurrentUser currentUser)
    : ICommandHandler<DisconnectGoogleLoginCommand, bool>
{
    public async ValueTask<bool> Handle(DisconnectGoogleLoginCommand command, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(command);

        var user = await ExternalLoginUsers.CurrentAsync(userManager, currentUser).ConfigureAwait(false);
        var logins = await userManager.GetLoginsAsync(user).ConfigureAwait(false);
        var google = logins.FirstOrDefault(l => l.LoginProvider == ExternalLoginProviders.Google);
        if (google is null)
        {
            return false;
        }

        if (!await userManager.HasPasswordAsync(user).ConfigureAwait(false) && logins.Count == 1)
        {
            throw new CustomException(
                "Google is your only way to sign in. Set a password first, then disconnect Google.", errors: null, HttpStatusCode.Conflict);
        }

        var result = await userManager.RemoveLoginAsync(user, google.LoginProvider, google.ProviderKey).ConfigureAwait(false);
        if (!result.Succeeded)
        {
            throw new CustomException(
                "Couldn't disconnect the Google account.", result.Errors.Select(e => e.Description).ToList(), HttpStatusCode.BadRequest);
        }

        return true;
    }
}

/// <summary>The signed-in user's connected accounts.</summary>
public sealed class GetMyExternalLoginsQueryHandler(
    UserManager<FshUser> userManager,
    ICurrentUser currentUser,
    IGoogleIdTokenValidator googleTokens) : IQueryHandler<GetMyExternalLoginsQuery, MyExternalLoginsDto>
{
    public async ValueTask<MyExternalLoginsDto> Handle(GetMyExternalLoginsQuery query, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(query);

        var user = await ExternalLoginUsers.CurrentAsync(userManager, currentUser).ConfigureAwait(false);
        var logins = await userManager.GetLoginsAsync(user).ConfigureAwait(false);
        return new MyExternalLoginsDto(
            logins.Select(l => new ExternalLoginDto(l.LoginProvider, l.ProviderDisplayName)).ToList(),
            HasPassword: await userManager.HasPasswordAsync(user).ConfigureAwait(false),
            GoogleEnabled: googleTokens.IsEnabled);
    }
}

internal static class ExternalLoginUsers
{
    public static async Task<FshUser> CurrentAsync(UserManager<FshUser> userManager, ICurrentUser currentUser)
    {
        if (!currentUser.IsAuthenticated())
        {
            throw new UnauthorizedException();
        }

        string userId = currentUser.GetUserId().ToString();
        return await userManager.FindByIdAsync(userId).ConfigureAwait(false)
            ?? throw new NotFoundException($"User {userId} not found.");
    }
}

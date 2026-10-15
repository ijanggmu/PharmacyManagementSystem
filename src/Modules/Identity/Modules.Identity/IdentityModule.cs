using Asp.Versioning;
using FSH.Framework.Core.Context;
using FSH.Framework.Eventing;
using FSH.Framework.Persistence;
using FSH.Framework.Quota;
using FSH.Framework.Storage;
using FSH.Framework.Storage.Local;
using FSH.Framework.Storage.Services;
using FSH.Framework.Web.Modules;
using FSH.Modules.Identity.Authorization;
using FSH.Modules.Identity.Authorization.Jwt;
using FSH.Modules.Identity.Contracts.Services;
using FSH.Modules.Identity.Data;
using FSH.Modules.Identity.Domain;
using FSH.Modules.Identity.Features.v1.Approvals.IssueApproval;
using FSH.Modules.Identity.Features.v1.Approvals.SearchApprovals;
using FSH.Modules.Identity.Features.v1.Groups.AddUsersToGroup;
using FSH.Modules.Identity.Features.v1.Groups.CreateGroup;
using FSH.Modules.Identity.Features.v1.Groups.DeleteGroup;
using FSH.Modules.Identity.Features.v1.Groups.GetGroupById;
using FSH.Modules.Identity.Features.v1.Groups.GetGroupMembers;
using FSH.Modules.Identity.Features.v1.Groups.GetGroups;
using FSH.Modules.Identity.Features.v1.Groups.RemoveUserFromGroup;
using FSH.Modules.Identity.Features.v1.Groups.UpdateGroup;
using FSH.Modules.Identity.Features.v1.Impersonation.EndImpersonation;
using FSH.Modules.Identity.Features.v1.Impersonation.GetImpersonationGrants;
using FSH.Modules.Identity.Features.v1.Impersonation.RevokeImpersonationGrant;
using FSH.Modules.Identity.Features.v1.Impersonation.StartImpersonation;
using FSH.Modules.Identity.Features.v1.Permissions.GetPermissionCatalog;
using FSH.Modules.Identity.Features.v1.Roles;
using FSH.Modules.Identity.Features.v1.Roles.DeleteRole;
using FSH.Modules.Identity.Features.v1.Roles.GetRoleById;
using FSH.Modules.Identity.Features.v1.Roles.GetRoles;
using FSH.Modules.Identity.Features.v1.Roles.GetRoleWithPermissions;
using FSH.Modules.Identity.Features.v1.Roles.UpdateRolePermissions;
using FSH.Modules.Identity.Features.v1.Roles.UpsertRole;
using FSH.Modules.Identity.Features.v1.Sessions.AdminRevokeAllSessions;
using FSH.Modules.Identity.Features.v1.Sessions.AdminRevokeSession;
using FSH.Modules.Identity.Features.v1.Sessions.GetMySessions;
using FSH.Modules.Identity.Features.v1.Sessions.GetTenantSessions;
using FSH.Modules.Identity.Features.v1.Sessions.GetUserSessions;
using FSH.Modules.Identity.Features.v1.Sessions.RevokeAllSessions;
using FSH.Modules.Identity.Features.v1.Sessions.RevokeSession;
using FSH.Modules.Identity.Features.v1.Tokens.RefreshToken;
using FSH.Modules.Identity.Features.v1.Tokens.ResolvePasswordLogin;
using FSH.Modules.Identity.Features.v1.Tokens.RevokeRefreshToken;
using FSH.Modules.Identity.Features.v1.Tokens.TokenGeneration;
using FSH.Modules.Identity.Features.v1.ExternalLogins;
using FSH.Modules.Identity.Services.Google;
using FSH.Modules.Identity.Features.v1.TwoFactor;
using FSH.Modules.Identity.Features.v1.TwoFactor.Disable;
using FSH.Modules.Identity.Features.v1.TwoFactor.Enroll;
using FSH.Modules.Identity.Features.v1.TwoFactor.RecoveryCodes;
using FSH.Modules.Identity.Features.v1.TwoFactor.Status;
using FSH.Modules.Identity.Features.v1.TwoFactor.VerifyEnroll;
using FSH.Modules.Identity.Features.v1.Users.AdminUpdateUser;
using FSH.Modules.Identity.Features.v1.Users.AssignUserRoles;
using FSH.Modules.Identity.Features.v1.Users.ChangePassword;
using FSH.Modules.Identity.Features.v1.Users.AdminConfirmEmail;
using FSH.Modules.Identity.Features.v1.Users.AdminResetTwoFactor;
using FSH.Modules.Identity.Features.v1.Users.ConfirmEmail;
using FSH.Modules.Identity.Features.v1.Users.ResendConfirmationEmail;
using FSH.Modules.Identity.Features.v1.Users.DeleteUser;
using FSH.Modules.Identity.Features.v1.Users.ForgotPassword;
using FSH.Modules.Identity.Features.v1.Users.GetUserById;
using FSH.Modules.Identity.Features.v1.Users.GetUserGroups;
using FSH.Modules.Identity.Features.v1.Users.GetUserPermissions;
using FSH.Modules.Identity.Features.v1.Users.GetUserProfile;
using FSH.Modules.Identity.Features.v1.Users.GetUserRoles;
using FSH.Modules.Identity.Features.v1.Users.GetUsers;
using FSH.Modules.Identity.Features.v1.Users.RegisterUser;
using FSH.Modules.Identity.Features.v1.Users.ResetPassword;
using FSH.Modules.Identity.Features.v1.Users.SearchUsers;
using FSH.Modules.Identity.Features.v1.Users.SelfRegistration;
using FSH.Modules.Identity.Features.v1.Users.SetProfileImage;
using FSH.Modules.Identity.Features.v1.Users.ToggleUserStatus;
using FSH.Modules.Identity.Features.v1.Users.UpdateUser;
using FSH.Modules.Identity.Services;
using FSH.Modules.Identity.Services.Approvals;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Routing;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Diagnostics.HealthChecks;
using Microsoft.Extensions.Hosting;

namespace FSH.Modules.Identity;

public class IdentityModule : IModule
{
    public void ConfigureServices(IHostApplicationBuilder builder)
    {
        ArgumentNullException.ThrowIfNull(builder);

        FSH.Framework.Shared.Constants.PermissionConstants.Register(
            FSH.Modules.Identity.Contracts.Authorization.IdentityPermissions.All);

        var services = builder.Services;
        services.AddScoped<RolePermissionSyncer>();
        services.AddHostedService<RolePermissionSyncHostedService>();
        services.AddSingleton<IAuthorizationMiddlewareResultHandler, PathAwareAuthorizationHandler>();
        services.AddScoped<ICurrentUserService, CurrentUserService>();
        services.AddScoped<ICurrentUser>(sp => sp.GetRequiredService<ICurrentUserService>());
        services.AddScoped<ICurrentUserInitializer>(sp => sp.GetRequiredService<ICurrentUserService>());
        services.AddScoped<IRequestContextService, RequestContextService>();
        services.AddScoped<IRequestContext>(sp => sp.GetRequiredService<IRequestContextService>());
        services.AddScoped<ITokenService, TokenService>();
        services.AddScoped<IImpersonationGrantService, ImpersonationGrantService>();
        services.AddScoped<IApprovalService, ApprovalService>();
        services.AddSingleton<ApprovalAttemptThrottle>();
        // Live user / session state behind each access token (deactivation and session revocation take effect
        // within seconds instead of at token expiry). Singletons: they open their own tenant scope per lookup.
        services.AddSingleton<IAccessTokenStateStore, AccessTokenStateStore>();
        services.AddSingleton<AccessTokenStateService>();
        services.AddSingleton<IAccessTokenStateCache>(sp => sp.GetRequiredService<AccessTokenStateService>());

        // User services - focused single-responsibility services
        services.AddTransient<IUserRegistrationService, UserRegistrationService>();
        services.AddTransient<IUserProfileService, UserProfileService>();
        services.AddTransient<IUserStatusService, UserStatusService>();
        services.AddTransient<IUserRoleService, UserRoleService>();
        services.AddTransient<IUserPasswordService, UserPasswordService>();
        services.AddTransient<IUserPermissionService, UserPermissionService>();

        // Facade for backward compatibility
        services.AddTransient<IUserService, UserService>();

        services.AddTransient<IRoleService, RoleService>();
        services.AddHeroStorage(builder.Configuration);
        services.AddScoped<IIdentityService, IdentityService>();
        services.AddHeroDbContext<IdentityDbContext>();
        // Eventing itself is bootstrapped by the host (AddEventingCore) — the outbox is framework
        // infrastructure, not Identity's. Handler registration stays per module.
        services.AddIntegrationEventHandlers(typeof(IdentityModule).Assembly);
        builder.Services.AddHealthChecks()
            .AddDbContextCheck<IdentityDbContext>(
                name: "db:identity",
                failureStatus: HealthStatus.Unhealthy);
        services.AddScoped<IDbInitializer, IdentityDbInitializer>();

        // Configure password policy options
        services.Configure<PasswordPolicyOptions>(builder.Configuration.GetSection("PasswordPolicy"));

        // Anonymous self-registration is per-tenant opt-in (off by default).
        services.Configure<SelfRegistrationOptions>(builder.Configuration.GetSection(SelfRegistrationOptions.SectionName));

        // Tenant subscription grace period (shared "Billing" section) — used by the login expiry check.
        services.Configure<TenantGraceOptions>(builder.Configuration.GetSection(TenantGraceOptions.SectionName));

        // Register password history service
        services.AddScoped<IPasswordHistoryService, PasswordHistoryService>();

        // Register password expiry service
        services.AddScoped<IPasswordExpiryService, PasswordExpiryService>();

        // Register session service and background cleanup
        services.AddScoped<ISessionService, SessionService>();
        services.AddHostedService<SessionCleanupHostedService>();

        // Google sign-in/sign-up (off until GoogleAuth:ClientIds is set) and sign-up admin staging.
        services.Configure<GoogleAuthOptions>(builder.Configuration.GetSection(GoogleAuthOptions.SectionName));
        services.AddSingleton<IGoogleSigningKeyProvider, GoogleSigningKeyProvider>();
        services.AddSingleton<IGoogleIdTokenValidator, GoogleIdTokenValidator>();
        services.AddScoped<LoginTokenIssuer>();
        services.AddScoped<ITenantAdminProfileStaging, TenantAdminProfileStaging>();

        // Register group role service for group-derived permissions
        services.AddScoped<IGroupRoleService, GroupRoleService>();

        // Quota gauge: reports live user count per tenant for the Users quota.
        services.AddScoped<IQuotaGaugeProvider, UserCountQuotaGaugeProvider>();

        services.AddIdentity<FshUser, FshRole>(options =>
        {
            options.Password.RequiredLength = IdentityModuleConstants.PasswordLength;
            options.Password.RequireDigit = true;
            options.Password.RequireLowercase = true;
            options.Password.RequireNonAlphanumeric = false;
            options.Password.RequireUppercase = true;
            options.User.RequireUniqueEmail = true;

            // Account lockout: 5 consecutive failed logins → 15-minute lockout (applies to new users by default).
            // IdentityService's login flow drives AccessFailedAsync / IsLockedOutAsync.
            options.Lockout.AllowedForNewUsers = true;
            options.Lockout.MaxFailedAccessAttempts = 5;
            options.Lockout.DefaultLockoutTimeSpan = TimeSpan.FromMinutes(15);
        })
           .AddEntityFrameworkStores<IdentityDbContext>()
           .AddDefaultTokenProviders()
           // Replaces the default authenticator provider (same name, registered later wins) with one that
           // rejects a TOTP code whose time step was already used.
           .AddTokenProvider<ReplayProtectedAuthenticatorTokenProvider>(TokenOptions.DefaultAuthenticatorProvider);

        //metrics
        services.AddSingleton<IdentityMetrics>();

        services.ConfigureJwtAuth();
    }

    public void MapEndpoints(IEndpointRouteBuilder endpoints)
    {
        ArgumentNullException.ThrowIfNull(endpoints);

        var apiVersionSet = endpoints.NewApiVersionSet()
            .HasApiVersion(new ApiVersion(1))
            .ReportApiVersions()
            .Build();

        var group = endpoints
            .MapGroup("api/v{version:apiVersion}/identity")
            .WithTags("Identity")
            .WithApiVersionSet(apiVersionSet);

        // tokens
        group.MapGenerateTokenEndpoint().AllowAnonymous().RequireRateLimiting("auth");
        // Refresh is NOT on the strict "auth" policy (10/min/IP): every signed-in tab and the BFF refresh
        // through the same (often shared, NAT'd) client IP, so the login brute-force budget would log real
        // users out. It still goes through the global tenant/user/IP limiter, and a refresh token is a
        // 256-bit secret that cannot be guessed.
        group.MapRefreshTokenEndpoint().AllowAnonymous();
        group.MapRevokeRefreshTokenEndpoint().RequireRateLimiting("auth");
        // Sign-in without a pharmacy code: which pharmacies these credentials open (strict "auth" policy).
        group.MapResolvePasswordLoginEndpoint();

        // Google sign-in / sign-up / connected accounts
        group.MapGoogleTokenEndpoint();
        group.MapResolveGoogleLoginEndpoint();
        group.MapVerifyGoogleSignUpEndpoint();
        group.MapGetMyExternalLoginsEndpoint();
        group.MapConnectGoogleLoginEndpoint();
        group.MapDisconnectGoogleLoginEndpoint();

        // The outbox is dispatched by the framework's OutboxDispatcherHostedService (on by default), which now claims
        // rows with FOR UPDATE SKIP LOCKED so several instances can drain safely. This module still registers no
        // dispatcher of its own: the outbox is framework infrastructure, not Identity's.

        // roles
        group.MapGetRolesEndpoint();
        group.MapGetRoleByIdEndpoint();
        group.MapDeleteRoleEndpoint();
        group.MapGetRolePermissionsEndpoint();
        group.MapUpdateRolePermissionsEndpoint();
        group.MapCreateOrUpdateRoleEndpoint();

        // permission catalog — every permission registered with the host,
        // filtered to the caller's tenant context (root vs admin set)
        group.MapGetPermissionCatalogEndpoint();

        // users
        group.MapAssignUserRolesEndpoint();
        group.MapChangePasswordEndpoint().RequireRateLimiting("auth");
        group.MapAdminConfirmEmailEndpoint();
        group.MapAdminResetTwoFactorEndpoint();
        group.MapResendConfirmationEmailEndpoint().RequireRateLimiting("auth");
        group.MapConfirmEmailEndpoint().RequireRateLimiting("auth");
        group.MapDeleteUserEndpoint();
        group.MapGetUserByIdEndpoint();
        group.MapGetCurrentUserPermissionsEndpoint();
        group.MapGetMeEndpoint();
        group.MapGetUserRolesEndpoint();
        group.MapGetUsersListEndpoint();
        group.MapSearchUsersEndpoint();
        group.MapRegisterUserEndpoint();
        group.MapForgotPasswordEndpoint().RequireRateLimiting("auth");
        group.MapResetPasswordEndpoint().RequireRateLimiting("auth");
        group.MapSelfRegisterUserEndpoint().RequireRateLimiting("auth");
        group.MapToggleUserStatusEndpoint();
        group.MapAdminUpdateUserEndpoint();
        group.MapUpdateUserEndpoint();
        group.MapSetProfileImageEndpoint();

        // sessions - user endpoints
        group.MapGetMySessionsEndpoint();
        group.MapRevokeSessionEndpoint();
        group.MapRevokeAllSessionsEndpoint();

        // sessions - admin endpoints
        group.MapGetTenantSessionsEndpoint();
        group.MapGetUserSessionsEndpoint();
        group.MapAdminRevokeSessionEndpoint();
        group.MapAdminRevokeAllSessionsEndpoint();

        // groups
        group.MapGetGroupsEndpoint();
        group.MapGetGroupByIdEndpoint();
        group.MapCreateGroupEndpoint();
        group.MapUpdateGroupEndpoint();
        group.MapDeleteGroupEndpoint();
        group.MapGetGroupMembersEndpoint();
        group.MapAddUsersToGroupEndpoint();
        group.MapRemoveUserFromGroupEndpoint();

        // user groups
        group.MapGetUserGroupsEndpoint();

        // impersonation
        group.MapStartImpersonationEndpoint();
        group.MapEndImpersonationEndpoint();
        group.MapGetImpersonationGrantsEndpoint();
        group.MapRevokeImpersonationGrantEndpoint();

        // two-factor authentication (TOTP)
        group.MapEnrollTwoFactorEndpoint();
        group.MapVerifyEnrollTwoFactorEndpoint();
        group.MapDisableTwoFactorEndpoint();
        group.MapGetTwoFactorStatusEndpoint();
        group.MapGenerateRecoveryCodesEndpoint().RequireRateLimiting("auth");

        // manager approvals: issuing re-verifies the approver's password, so it is on the strict auth limit
        group.MapIssueApprovalEndpoint().RequireRateLimiting("auth");
        group.MapSearchApprovalsEndpoint();
    }
}
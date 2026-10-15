# Module: Identity

Auth (JWT + ASP.NET Identity), users, roles, permissions, sessions, impersonation, 2FA.

## Service shape

`IUserService` is a **facade** that delegates to focused single-responsibility services — change behavior in the specific service, not the facade:

| Interface | Concern |
|---|---|
| `IUserRegistrationService` | register, external-principal create, email/phone confirm |
| `IUserProfileService` | get/list/count, update profile, image, existence checks |
| `IUserStatusService` | activate/deactivate (`DeleteAsync` == deactivate), audited toggles |
| `IUserRoleService` | role assignment, admin-role guards |
| `IUserPasswordService` | forgot/reset/change password, history + expiry |
| `IUserPermissionService` | effective permissions, cache invalidation |

`ChangePassword`/`Update`/`Delete` etc. flow facade → service → EF/UserManager. `CancellationToken` is `= default` on these interfaces and propagated into EF sinks (note: `UserManager`/`RoleManager` have no CT overloads, so private helpers that only call them don't take one).

## Basic is minimal

Every user holds `Basic`, so `IsBasic: true` means "every cashier and helper can call this". Keep it to what anyone at the counter needs: medicine/batch/category lookup, pharmacy settings view, dashboard context, branches (view/switch), tenant theme, notifications, own sessions, own tickets, file upload, onboarding status. Never mark a view of money, people or history basic (accounts, vouchers, ledgers, sales history, shifts, returns, purchasing, prescriptions, suppliers, customers, users/roles). Grant those per role in `PharmacyRoleSeedData.RolePermissionRules`; un-basic-ing a permission revokes it from `Basic` on the next `RolePermissionSyncer` run, so add the matching role grants in the same change. Pages that call a reports endpoint a role may lack should gate the call (`useHasPermission`) rather than lean on Basic.

## Permission gating footgun

`RequiredPermissionAttribute` implements `FSH.Framework.Shared.Identity.Authorization.IRequiredPermissionMetadata`. **Never let a second/duplicate `IRequiredPermissionMetadata` appear** — it silently disables **all** `.RequirePermission()` gates across the app. Permission constants live in `Shared/Identity/*Permissions.cs`.

## Hosted services (background)

- `RolePermissionSyncHostedService` — best-effort sync of the permission catalog; loops, catches `Exception` *with* an `OperationCanceledException` filter, logs and continues.
- `SessionCleanupHostedService` — hourly expired-session purge; OCE handled by a preceding catch.

These are the model for background loops: stay alive, log with context, never swallow cancellation. See `api-conventions.md`.

## Tokens / sessions

Login `POST /api/v1/identity/token/issue` (header `X-FSH-App` enforces the operator/tenant app boundary). Refresh `POST /api/v1/identity/token/refresh` cross-checks subject. **Every token-issuing flow must write a `UserSession` row** (login, external login, EndImpersonation — in the actor's tenant); a failure fails the request, because refresh rejects tokens with no session row. Rotation is an atomic conditional UPDATE (`ISessionService.UpdateSessionRefreshTokenAsync` returns false when another refresh won); replaying an already-rotated token (matches `PreviousRefreshTokenHash`) revokes the session (reuse detection).

2FA: wrong TOTP / recovery codes count toward lockout (`AccessFailedAsync`); the counter resets only after every factor passed. The authenticator provider is `ReplayProtectedAuthenticatorTokenProvider` (a used TOTP time step is never accepted again). Emailed links (confirm email, reset password) are built from `OriginOptions:OriginUrl` (the web app) via `WebAppOrigin` — never from the request Host. Admin can't demote/deactivate the last admin or the root-tenant seed admin (guards in `UserRoleService`/`UserStatusService`).

## Tests

`Identity.Tests` is the largest unit suite. When asserting a forwarded `CancellationToken`, assert the specific token (see `testing.md`).

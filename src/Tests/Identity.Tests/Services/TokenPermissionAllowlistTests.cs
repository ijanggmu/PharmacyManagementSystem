using System.Diagnostics.Metrics;
using System.Security.Claims;
using FSH.Framework.Shared.Constants;
using FSH.Modules.Accounting.Contracts.Authorization;
using FSH.Modules.Auditing.Contracts.Authorization;
using FSH.Modules.Billing.Contracts.Authorization;
using FSH.Modules.Catalog.Contracts.Authorization;
using FSH.Modules.Chat.Contracts.Authorization;
using FSH.Modules.Customers.Contracts.Authorization;
using FSH.Modules.Files.Contracts.Authorization;
using FSH.Modules.Identity;
using FSH.Modules.Identity.Authorization.Jwt;
using FSH.Modules.Identity.Contracts.Authorization;
using FSH.Modules.Identity.Services;
using FSH.Modules.Inventory.Contracts.Authorization;
using FSH.Modules.Multitenancy.Contracts.Authorization;
using FSH.Modules.Notifications.Contracts.Authorization;
using FSH.Modules.Onboarding.Contracts.Authorization;
using FSH.Modules.Payroll.Contracts.Authorization;
using FSH.Modules.Prescriptions.Contracts.Authorization;
using FSH.Modules.Purchasing.Contracts.Authorization;
using FSH.Modules.Reference.Contracts.Authorization;
using FSH.Modules.Sales.Contracts.Authorization;
using FSH.Modules.Suppliers.Contracts.Authorization;
using FSH.Modules.Tickets.Contracts.Authorization;
using FSH.Modules.Webhooks.Contracts.Authorization;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
using NSubstitute;

namespace Identity.Tests.Services;

/// <summary>
/// Reproduces the root Admin token-size bug and proves the fix. The bug: the "permission" claim
/// was written for every permission string a role held, and root Admin's role holds every
/// starter-kit permission across every module (most unrelated to this pharmacy app), pushing the
/// signed access token to ~10.8KB — well past the ~4096 byte limit browsers/curl apply to a single
/// cookie, so the SuperAdmin session cookie was silently dropped.
///
/// The fix (<see cref="TokenPermissionAllowlist"/>, wired into
/// <c>IdentityService.AddPermissionClaimsAsync</c>) filters the permission claims written into the
/// token down to the resources this app's frontend actually checks
/// (lib/api/dotnet-permissions.ts, dotnet-session.ts, branches-api.ts in the frontend repo), for
/// every role, not just Admin.
///
/// This test builds the REAL, full permission catalog by pulling every module's
/// <c>XPermissions.All</c> list directly (the same lists <c>RolePermissionSyncer</c> writes to the
/// Admin role's claims for the root tenant: <c>PermissionConstants.Admin</c> + <c>.Root</c>), issues
/// a real signed JWT via <see cref="TokenService"/> with and without the allowlist, and measures the
/// actual serialized access token length — not a live HTTP call.
/// </summary>
public sealed class TokenPermissionAllowlistTests : IDisposable
{
    private const string SigningKey = "this-is-a-very-long-signing-key-32!!";
    private const string Issuer = "fsh-issuer";
    private const string Audience = "fsh-audience";

    private readonly IdentityMetrics _metrics;

    public TokenPermissionAllowlistTests()
    {
        var meterFactory = Substitute.For<IMeterFactory>();
        meterFactory.Create(Arg.Any<MeterOptions>()).Returns(_ => new Meter(IdentityMetrics.MeterName));
        _metrics = new IdentityMetrics(meterFactory);
    }

    public void Dispose() => _metrics.Dispose();

    /// <summary>
    /// The full, real permission catalog across every starter-kit module — equivalent to what
    /// <c>PermissionConstants.All</c> holds once every module's <c>ConfigureServices</c> has run
    /// <c>PermissionConstants.Register(...)</c> during normal app startup (not exercised by this
    /// unit test host), built here by reading each module's own <c>.All</c> registry directly so
    /// the measurement reflects production permission names exactly.
    /// </summary>
    private static List<string> FullCatalogPermissionNames() =>
        SystemPermissions.All
            .Concat(AccountingPermissions.All)
            .Concat(AuditingPermissions.All)
            .Concat(BillingPermissions.All)
            .Concat(CatalogPermissions.All)
            .Concat(ChatPermissions.All)
            .Concat(CustomersPermissions.All)
            .Concat(FilesPermissions.All)
            .Concat(IdentityPermissions.All)
            .Concat(InventoryPermissions.All)
            .Concat(MultitenancyPermissions.All)
            .Concat(NotificationPermissions.All)
            .Concat(OnboardingPermissions.All)
            .Concat(PayrollPermissions.All)
            .Concat(PrescriptionsPermissions.All)
            .Concat(PurchasingPermissions.All)
            .Concat(ReferencePermissions.All)
            .Concat(SalesPermissions.All)
            .Concat(SuppliersPermissions.All)
            .Concat(TicketsPermissions.All)
            .Concat(WebhooksPermissions.All)
            .Select(p => p.Name)
            .Distinct(StringComparer.Ordinal)
            .ToList();

    /// <summary>
    /// Every permission name the frontend's DOTNET_ROOT_PERMISSIONS list requires to be present
    /// before it recognizes a token as the root tenant's SuperAdmin (isDotnetRootUser /
    /// isSuperAdmin in lib/api/dotnet-permissions.ts and dotnet-session.ts). The fix must not drop
    /// any of these for the root Admin role.
    /// </summary>
    private static readonly string[] FrontendRootPermissions =
    [
        "Permissions.Platform.Tenants.View",
        "Permissions.Platform.Tenants.Create",
        "Permissions.Platform.Tenants.Update",
        "Permissions.Platform.Tenants.Suspend",
        "Permissions.Platform.Tenants.Delete",
        "Permissions.Platform.Plans.Manage",
        "Permissions.Platform.Subscriptions.Manage",
        "Permissions.Platform.Invoices.Admin",
        "Permissions.Platform.Webhooks.Admin",
        "Permissions.Platform.Audits.ViewAll",
        "Permissions.Platform.Users.Impersonate",
        "Permissions.AuditTrails.ViewCrossTenant",
        "Permissions.Tenants.View",
        "Permissions.Tenants.Create",
        "Permissions.Tenants.Update",
        "Permissions.Tenants.UpgradeSubscription",
    ];

    /// <summary>
    /// One representative .NET permission name per DOTNET_PERMISSION_MAP entry in the frontend's
    /// lib/api/dotnet-permissions.ts, so the test fails if the allowlist ever stops matching what
    /// the frontend's legacy-permission bridge actually checks.
    /// </summary>
    private static readonly string[] FrontendMappedPermissions =
    [
        "Permissions.Inventory.Medicines.View",
        "Permissions.Sales.Sales.View",
        "Permissions.Prescriptions.Prescriptions.View",
        "Permissions.Customers.Customers.View",
        "Permissions.Suppliers.Suppliers.View",
        "Permissions.Inventory.Reports.View",
        "Permissions.Accounting.Vouchers.View",
        "Permissions.Accounting.Expenses.Record",
        "Permissions.Reference.Settings.View",
        "Permissions.Users.View",
        "Permissions.Users.Create",
        "Permissions.Branches.Manage",
    ];

    private TokenService CreateTokenService()
    {
        var options = Options.Create(new JwtOptions
        {
            Issuer = Issuer,
            Audience = Audience,
            SigningKey = SigningKey,
            AccessTokenMinutes = 30,
            RefreshTokenDays = 7,
        });
        var logger = Substitute.For<ILogger<TokenService>>();
        return new TokenService(options, logger, _metrics, TimeProvider.System);
    }

    private static List<Claim> BuildClaims(IEnumerable<string> permissionNames) =>
    [
        new Claim(ClaimTypes.NameIdentifier, "root-admin-user"),
        new Claim(ClaimTypes.Email, "admin@root.local"),
        new Claim(ClaimTypes.Role, "Admin"),
        new Claim(ClaimConstants.Tenant, "root"),
        .. permissionNames.Select(p => new Claim(ClaimConstants.Permission, p)),
    ];

    [Fact]
    public async Task FullCatalog_WithoutAllowlist_ReproducesOversizedToken()
    {
        // This is the confirmed bug, reproduced directly from the real permission catalog: the
        // unfiltered root Admin token is far larger than the ~4096 byte cookie limit. Measured here
        // at 10,317 bytes / 199 permission claims, in line with the reported 10,865 bytes (the small
        // difference is the other per-user claims — email/name length — not the permission claims).
        var fullCatalog = FullCatalogPermissionNames();
        fullCatalog.Count.ShouldBeGreaterThan(100); // sanity: the catalog actually loaded every module

        var service = CreateTokenService();
        var response = await service.IssueAsync("root-admin-user", BuildClaims(fullCatalog));

        response.AccessToken.Length.ShouldBeGreaterThan(8000);
    }

    /// <summary>
    /// Measured: 140 permission claims / 7,752 bytes after filtering (vs. 199 claims / 10,317 bytes
    /// before) — a real, verified reduction, but NOT a fix for the cookie ceiling by itself: most of
    /// the 140 remaining claims are this pharmacy app's OWN fine-grained permissions (many resources
    /// x many actions across Sales/Inventory/Purchasing/Suppliers/Customers/Prescriptions/Accounting/
    /// Reference/Multitenancy/Identity/Notifications/Onboarding), not unrelated starter-kit modules.
    /// Only 59 of the 199 catalog permissions belonged to modules this app excludes (Chat, Tickets,
    /// Webhooks, Files, Groups, Hangfire, Impersonation, Sessions, RoleClaims, Catalog,
    /// AuditTrails.View) — Billing was originally in that list too but is now kept (see
    /// <see cref="Filter_KeepsBillingPermissions"/>). Root Admin's token after this fix is smaller but still above the ~4096
    /// byte single-cookie ceiling that caused the original bug — see the report for what that means
    /// for live verification.
    /// </summary>
    [Fact]
    public async Task FullCatalog_WithAllowlist_IsSubstantiallySmallerButNotUnderTheCookieCeiling()
    {
        var fullCatalog = FullCatalogPermissionNames();
        var filtered = TokenPermissionAllowlist.Filter(fullCatalog).ToList();

        var service = CreateTokenService();
        var before = await service.IssueAsync("root-admin-user", BuildClaims(fullCatalog));
        var after = await service.IssueAsync("root-admin-user", BuildClaims(filtered));

        // Real, measured improvement: ~25% smaller, 59 fewer permission claims.
        after.AccessToken.Length.ShouldBeLessThan((int)(before.AccessToken.Length * 0.85));
        filtered.Count.ShouldBeLessThan(fullCatalog.Count - 40);

        // Documents — does not claim — the remaining gap to the ~4096 byte cookie ceiling.
        after.AccessToken.Length.ShouldBeLessThan(9000);
    }

    [Fact]
    public void Filter_KeepsEveryFrontendRootPermission()
    {
        var filtered = TokenPermissionAllowlist.Filter(FullCatalogPermissionNames()).ToHashSet(StringComparer.Ordinal);

        foreach (var permission in FrontendRootPermissions)
        {
            filtered.ShouldContain(permission);
        }
    }

    [Theory]
    [MemberData(nameof(FrontendMappedPermissionCases))]
    public void Filter_KeepsPermissionsTheFrontendMapsLegacyChecksTo(string permission)
    {
        var filtered = TokenPermissionAllowlist.Filter(FullCatalogPermissionNames()).ToHashSet(StringComparer.Ordinal);
        filtered.ShouldContain(permission);
    }

    public static IEnumerable<object[]> FrontendMappedPermissionCases() =>
        FrontendMappedPermissions.Select(p => new object[] { p });

    /// <summary>
    /// Billing is no longer excluded: the SuperAdmin tenant list/overview reads plan + subscription
    /// status + invoice history from the Billing module's RequirePermission(BillingPermissions.View)
    /// endpoints, so the claim must survive into the token or every one of those calls 403s.
    /// </summary>
    [Theory]
    [InlineData("Permissions.Billing.View")]
    [InlineData("Permissions.Billing.Manage")]
    public void Filter_KeepsBillingPermissions(string permission)
    {
        TokenPermissionAllowlist.Filter([permission]).ShouldContain(permission);
    }

    /// <summary>
    /// The tickets UI gates on these (own-ticket access for every user via the basic View/Create,
    /// the tenant support-desk view via ViewAll, and the workflow actions), so they must survive
    /// into the token or the Help &amp; support page and its actions stay hidden.
    /// </summary>
    [Theory]
    [InlineData("Permissions.Tickets.View")]
    [InlineData("Permissions.Tickets.ViewAll")]
    [InlineData("Permissions.Tickets.Create")]
    [InlineData("Permissions.Tickets.Assign")]
    [InlineData("Permissions.Tickets.Resolve")]
    [InlineData("Permissions.Tickets.Reopen")]
    [InlineData("Permissions.Tickets.Close")]
    [InlineData("Permissions.Tickets.Comment")]
    [InlineData("Permissions.Tickets.ViewCrossTenant")]
    public void Filter_KeepsTicketPermissionsTheFrontendChecks(string permission)
    {
        TokenPermissionAllowlist.Filter([permission]).ShouldContain(permission);
    }

    [Theory]
    [InlineData("Permissions.Chat.Channels.View")]
    [InlineData("Permissions.Tickets.Update")]
    [InlineData("Permissions.Tickets.Delete")]
    [InlineData("Permissions.Webhooks.View")]
    [InlineData("Permissions.Files.Upload")]
    [InlineData("Permissions.Groups.View")]
    [InlineData("Permissions.Hangfire.View")]
    [InlineData("Permissions.Sessions.View")]
    [InlineData("Permissions.Impersonation.View")]
    [InlineData("Permissions.RoleClaims.View")]
    [InlineData("Permissions.Catalog.Brands.View")]
    [InlineData("Permissions.AuditTrails.View")]
    public void Filter_DropsPermissionsFromModulesThisAppDoesNotUse(string permission)
    {
        TokenPermissionAllowlist.Filter([permission]).ShouldBeEmpty();
    }

    [Fact]
    public void Filter_DropsServerOnlyGatesInsideAllowedResources()
    {
        // Checked from the database by SupplierLedgerPermissionGuard; the frontend never reads it.
        TokenPermissionAllowlist.Filter(["Permissions.Suppliers.Ledger.OpeningBalance"]).ShouldBeEmpty();
        // The rest of the Suppliers.Ledger resource is still carried.
        TokenPermissionAllowlist.Filter(["Permissions.Suppliers.Ledger.View", "Permissions.Suppliers.Ledger.RecordPayment"])
            .Count().ShouldBe(2);
    }

    /// <summary>
    /// Manager approvals: the approvals-log nav needs Approvals.View in the token; Approvals.Approve is checked on the
    /// APPROVER from the database when an approval is issued, and Sales.OverrideCreditLimit in CreateSale (a cashier
    /// without it gets 403 approval_required) — neither is read by the UI, so neither costs cookie bytes.
    /// </summary>
    [Fact]
    public void Filter_KeepsApprovalsLog_ButDropsServerOnlyApprovalGates()
    {
        TokenPermissionAllowlist.Filter([IdentityPermissions.Approvals.View]).ShouldHaveSingleItem();
        TokenPermissionAllowlist.Filter([IdentityPermissions.Approvals.Approve]).ShouldBeEmpty();
        TokenPermissionAllowlist.Filter([SalesPermissions.Sales.OverrideCreditLimit]).ShouldBeEmpty();
        // Same for the price-level override (CreateSale) and managing price levels (the UI surfaces the API's 403).
        TokenPermissionAllowlist.Filter([SalesPermissions.Sales.OverridePriceLevel, SalesPermissions.PriceLevels.Manage]).ShouldBeEmpty();
        // The rest of Sales.Sales is still carried (the UI gates selling and cancelling on it).
        TokenPermissionAllowlist.Filter([SalesPermissions.Sales.Create, SalesPermissions.Sales.Cancel]).Count().ShouldBe(2);
    }

    /// <summary>Payroll: the nav and pages need Payroll.View in the token; Manage / Approve / Post are checked
    /// server-side (the UI surfaces the API's 403), so they cost no cookie bytes.</summary>
    [Fact]
    public void Filter_KeepsPayrollView_ButDropsServerOnlyPayrollGates()
    {
        TokenPermissionAllowlist.Filter([PayrollPermissions.Payroll.View]).ShouldHaveSingleItem();
        TokenPermissionAllowlist.Filter([
            PayrollPermissions.Payroll.Manage, PayrollPermissions.Payroll.Approve, PayrollPermissions.Payroll.Post,
        ]).ShouldBeEmpty();
    }

    /// <summary>
    /// Raw (unencoded) byte size of just the permission claim VALUES, excluding JWT header/base64/
    /// signature overhead — the "permission claims combined" figure. Measured: 6,743 bytes / 199
    /// claims before, 4,996 bytes / 140 claims after. A ~26% reduction, consistent with the full
    /// encoded token measurement in the test above.
    /// </summary>
    [Fact]
    public void Filter_ReducesCombinedPermissionClaimBytes()
    {
        var fullCatalog = FullCatalogPermissionNames();
        var filtered = TokenPermissionAllowlist.Filter(fullCatalog).ToList();

        var beforeRaw = fullCatalog.Sum(p => System.Text.Encoding.UTF8.GetByteCount(p));
        var afterRaw = filtered.Sum(p => System.Text.Encoding.UTF8.GetByteCount(p));

        filtered.Count.ShouldBeLessThan(fullCatalog.Count);
        afterRaw.ShouldBeLessThan(beforeRaw);
        // Budget, not a measurement: raised from 5,500 when the void-payment permissions (customer and supplier
        // ledgers, which the UI gates its Void action on) took the filtered set to ~5,570 bytes. The hard limit is
        // the encoded token size checked in the test above.
        afterRaw.ShouldBeLessThan(5800);
    }
}

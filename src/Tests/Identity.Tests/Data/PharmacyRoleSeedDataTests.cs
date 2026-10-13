using FSH.Framework.Shared.Constants;
using FSH.Framework.Shared.Identity.Claims;
using FSH.Modules.Accounting.Contracts.Authorization;
using FSH.Modules.Customers.Contracts.Authorization;
using FSH.Modules.Identity.Contracts.Authorization;
using FSH.Modules.Identity.Data;
using FSH.Modules.Identity.Domain;
using FSH.Modules.Inventory.Contracts.Authorization;
using FSH.Modules.Payroll.Contracts.Authorization;
using FSH.Modules.Prescriptions.Contracts.Authorization;
using FSH.Modules.Purchasing.Contracts.Authorization;
using FSH.Modules.Reference.Contracts.Authorization;
using FSH.Modules.Sales.Contracts.Authorization;
using FSH.Modules.Suppliers.Contracts.Authorization;
using Identity.Tests.Approvals;
using Microsoft.EntityFrameworkCore;

namespace Identity.Tests.Data;

/// <summary>
/// The pharmacy role table after the internal-controls change: Cashier can sell but not cancel sales or override
/// credit limits (it asks a manager instead), Manager can approve, the new Accountant role keeps the books without
/// the till — and existing tenants lose ONLY the seed-granted Cashier permissions, once.
/// </summary>
public sealed class PharmacyRoleSeedDataTests : IDisposable
{
    private static readonly object RegisterLock = new();
    private readonly IdentityDbContext _db = IdentityDbContextFactory.Create();

    public PharmacyRoleSeedDataTests()
    {
        // ResolveFor matches against the registered catalog (normally filled by each module at startup).
        lock (RegisterLock)
        {
            PermissionConstants.Register(SalesPermissions.All);
            PermissionConstants.Register(AccountingPermissions.All);
            PermissionConstants.Register(IdentityPermissions.All);
            PermissionConstants.Register(InventoryPermissions.All);
            PermissionConstants.Register(CustomersPermissions.All);
            PermissionConstants.Register(SuppliersPermissions.All);
            PermissionConstants.Register(PurchasingPermissions.All);
            PermissionConstants.Register(PrescriptionsPermissions.All);
            PermissionConstants.Register(ReferencePermissions.All);
            PermissionConstants.Register(PayrollPermissions.All);
        }
    }

    public void Dispose() => _db.Dispose();

    private static HashSet<string> Granted(string role) =>
        PharmacyRoleSeedData.ResolveFor(role).Select(p => p.Name).ToHashSet(StringComparer.Ordinal);

    #region Role table

    [Fact]
    public void Cashier_Should_SellButNotCancelOrOverrideCreditLimits()
    {
        var cashier = Granted(PharmacyRoleSeedData.Cashier);

        cashier.ShouldContain(SalesPermissions.Sales.Create);
        cashier.ShouldContain(SalesPermissions.Sales.View);
        cashier.ShouldNotContain(SalesPermissions.Sales.Cancel);
        cashier.ShouldNotContain(SalesPermissions.Sales.OverrideCreditLimit);
        cashier.ShouldNotContain(IdentityPermissions.Approvals.Approve);
    }

    [Fact]
    public void Manager_Should_KeepEverythingOnSales_And_BeAbleToApprove()
    {
        var manager = Granted(PharmacyRoleSeedData.Manager);

        manager.ShouldContain(SalesPermissions.Sales.Cancel);
        manager.ShouldContain(SalesPermissions.Sales.OverrideCreditLimit);
        manager.ShouldContain(AccountingPermissions.Vouchers.Post);
        manager.ShouldContain(IdentityPermissions.Approvals.Approve);
        manager.ShouldContain(IdentityPermissions.Approvals.View);
    }

    [Fact]
    public void Accountant_Should_KeepTheBooks_WithoutTheTill()
    {
        var accountant = Granted(PharmacyRoleSeedData.Accountant);

        PharmacyRoleSeedData.Roles.ShouldContain(PharmacyRoleSeedData.Accountant);
        accountant.ShouldContain(AccountingPermissions.Vouchers.Create);
        accountant.ShouldContain(AccountingPermissions.Vouchers.Post);
        accountant.ShouldContain(AccountingPermissions.Reports.View);
        accountant.ShouldContain(AccountingPermissions.Banking.Reconcile);
        accountant.ShouldContain(SuppliersPermissions.Ledger.RecordPayment);
        accountant.ShouldContain(SalesPermissions.Reports.View);
        accountant.ShouldContain(IdentityPermissions.Approvals.View);
        accountant.ShouldNotContain(SalesPermissions.Sales.Create);
        accountant.ShouldNotContain(SalesPermissions.Sales.Cancel);
        accountant.ShouldNotContain(SalesPermissions.Refunds.Create);
        accountant.ShouldNotContain(IdentityPermissions.Approvals.Approve);
        accountant.ShouldNotContain(CustomersPermissions.Credit.Manage);
        accountant.ShouldContain(PayrollPermissions.Payroll.Post);
        Granted(PharmacyRoleSeedData.Manager).ShouldNotContain(PayrollPermissions.Payroll.View);
    }

    #endregion

    #region Existing tenants

    private async Task<string> RoleWithClaimsAsync(params (string Value, string CreatedBy)[] permissions)
    {
        string roleId = Guid.CreateVersion7().ToString();
        foreach (var (value, createdBy) in permissions)
        {
            _db.RoleClaims.Add(new FshRoleClaim
            {
                RoleId = roleId, ClaimType = ClaimConstants.Permission, ClaimValue = value, CreatedBy = createdBy,
            });
        }

        await _db.SaveChangesAsync();
        return roleId;
    }

    private Task<List<string>> PermissionsOfAsync(string roleId) =>
        _db.RoleClaims.Where(c => c.RoleId == roleId && c.ClaimType == ClaimConstants.Permission).Select(c => c.ClaimValue!).ToListAsync();

    [Fact]
    public async Task Retract_Should_RemoveSeedGrantedCashierPermissions_Once()
    {
        string roleId = await RoleWithClaimsAsync(
            (SalesPermissions.Sales.Cancel, "application"),
            (SalesPermissions.Sales.OverrideCreditLimit, "RolePermissionSyncer"),
            (SalesPermissions.Sales.Create, "application"));

        int removed = await PharmacyRoleSeedData.RetractSeededPermissionsAsync(
            _db, roleId, PharmacyRoleSeedData.Cashier, "RolePermissionSyncer", DateTimeOffset.UtcNow, CancellationToken.None);

        removed.ShouldBe(2);
        (await PermissionsOfAsync(roleId)).ShouldBe([SalesPermissions.Sales.Create]);

        // An admin deliberately grants Cancel back afterwards: the retraction never runs again.
        _db.RoleClaims.Add(new FshRoleClaim
        {
            RoleId = roleId, ClaimType = ClaimConstants.Permission, ClaimValue = SalesPermissions.Sales.Cancel, CreatedBy = "application",
        });
        await _db.SaveChangesAsync();
        int again = await PharmacyRoleSeedData.RetractSeededPermissionsAsync(
            _db, roleId, PharmacyRoleSeedData.Cashier, "RolePermissionSyncer", DateTimeOffset.UtcNow, CancellationToken.None);

        again.ShouldBe(0);
        (await PermissionsOfAsync(roleId)).ShouldContain(SalesPermissions.Sales.Cancel);
    }

    [Fact]
    public async Task Retract_Should_KeepPermissionsAnAdminGranted()
    {
        string adminUserId = Guid.CreateVersion7().ToString();
        string roleId = await RoleWithClaimsAsync((SalesPermissions.Sales.Cancel, adminUserId));

        int removed = await PharmacyRoleSeedData.RetractSeededPermissionsAsync(
            _db, roleId, PharmacyRoleSeedData.Cashier, "application", DateTimeOffset.UtcNow, CancellationToken.None);

        removed.ShouldBe(0);
        (await PermissionsOfAsync(roleId)).ShouldBe([SalesPermissions.Sales.Cancel]);
    }

    [Fact]
    public async Task Retract_Should_NotTouchOtherRoles()
    {
        string roleId = await RoleWithClaimsAsync((SalesPermissions.Sales.Cancel, "application"));

        int removed = await PharmacyRoleSeedData.RetractSeededPermissionsAsync(
            _db, roleId, PharmacyRoleSeedData.Manager, "application", DateTimeOffset.UtcNow, CancellationToken.None);

        removed.ShouldBe(0);
        (await PermissionsOfAsync(roleId)).ShouldBe([SalesPermissions.Sales.Cancel]);
    }

    [Fact]
    public async Task Offer_Should_NotRegrantRetractedCashierPermissions()
    {
        // A tenant seeded before the change: Cancel was offered (marker) and granted by the seed.
        string roleId = await RoleWithClaimsAsync((SalesPermissions.Sales.Cancel, "application"));
        _db.RoleClaims.Add(new FshRoleClaim
        {
            RoleId = roleId, ClaimType = PharmacyRoleSeedData.SeededPermissionClaimType, ClaimValue = SalesPermissions.Sales.Cancel,
        });
        await _db.SaveChangesAsync();

        await PharmacyRoleSeedData.OfferSeededPermissionsAsync(
            _db, roleId, PharmacyRoleSeedData.ResolveFor(PharmacyRoleSeedData.Cashier), "RolePermissionSyncer", DateTimeOffset.UtcNow, CancellationToken.None);
        await PharmacyRoleSeedData.RetractSeededPermissionsAsync(
            _db, roleId, PharmacyRoleSeedData.Cashier, "RolePermissionSyncer", DateTimeOffset.UtcNow, CancellationToken.None);
        await PharmacyRoleSeedData.OfferSeededPermissionsAsync(
            _db, roleId, PharmacyRoleSeedData.ResolveFor(PharmacyRoleSeedData.Cashier), "RolePermissionSyncer", DateTimeOffset.UtcNow, CancellationToken.None);

        var granted = await PermissionsOfAsync(roleId);
        granted.ShouldNotContain(SalesPermissions.Sales.Cancel);
        granted.ShouldContain(SalesPermissions.Sales.Create);
    }

    #endregion
}

using System.Net;
using System.Security.Claims;
using Finbuckle.MultiTenant;
using Finbuckle.MultiTenant.Abstractions;
using FSH.Framework.Core.Context;
using FSH.Framework.Core.Exceptions;
using FSH.Framework.Shared.Constants;
using FSH.Framework.Shared.Multitenancy;
using FSH.Modules.Auditing.Contracts;
using FSH.Modules.Identity.Contracts.Authorization;
using FSH.Modules.Identity.Contracts.DTOs;
using FSH.Modules.Identity.Contracts.Services;
using FSH.Modules.Identity.Data;
using FSH.Modules.Identity.Domain;
using FSH.Modules.Identity.Features.v1.Roles;
using FSH.Modules.Identity.Services;
using Identity.Tests.Approvals;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;
using NSubstitute;

namespace Identity.Tests.Services;

/// <summary>
/// Users.ManageRoles / Roles.Update must not be a way up: only an administrator grants or removes Admin, a
/// non-admin can't edit a role they hold or grant permissions they don't hold, every permission must exist,
/// and role names are trimmed, never a system role's name and never a duplicate.
/// </summary>
public sealed class RoleEscalationGuardTests : IDisposable
{
    private readonly IdentityDbContext _db = IdentityDbContextFactory.Create();
    private readonly UserManager<FshUser> _userManager =
        Substitute.For<UserManager<FshUser>>(Substitute.For<IUserStore<FshUser>>(), null, null, null, null, null, null, null, null);
    private readonly RoleManager<FshRole> _roleManager =
        Substitute.For<RoleManager<FshRole>>(Substitute.For<IRoleStore<FshRole>>(), null, null, null, null);
    private readonly ICurrentUser _currentUser = Substitute.For<ICurrentUser>();
    private readonly IUserPermissionService _permissions = Substitute.For<IUserPermissionService>();
    private readonly ISecurityAudit _audit = Substitute.For<ISecurityAudit>();
    private readonly IMultiTenantContextAccessor<AppTenantInfo> _tenant = Substitute.For<IMultiTenantContextAccessor<AppTenantInfo>>();

    private readonly FshRole _adminRole = new(RoleConstants.Admin) { Id = "role-admin" };
    private readonly FshRole _managerRole = new("Manager") { Id = "role-manager" };
    private readonly FshUser _actor = new() { Id = Guid.CreateVersion7().ToString(), UserName = "manager", Email = "m@p.test" };
    private readonly FshUser _target = new() { Id = Guid.CreateVersion7().ToString(), UserName = "cashier", Email = "c@p.test" };

    public RoleEscalationGuardTests()
    {
        PermissionConstants.Register(IdentityPermissions.All);
        _tenant.MultiTenantContext.Returns(new MultiTenantContext<AppTenantInfo>(new AppTenantInfo(IdentityDbContextFactory.TenantId, IdentityDbContextFactory.TenantId)));
        _currentUser.GetUserId().Returns(Guid.Parse(_actor.Id));
        _currentUser.GetTenant().Returns(IdentityDbContextFactory.TenantId);

        _roleManager.FindByNameAsync(Arg.Any<string>()).Returns(ci =>
            new[] { _adminRole, _managerRole }.FirstOrDefault(r => string.Equals(r.Name, ci.Arg<string>().Trim(), StringComparison.OrdinalIgnoreCase)));
        _roleManager.FindByIdAsync(_managerRole.Id).Returns(_managerRole);
        _roleManager.GetClaimsAsync(_managerRole).Returns(new List<Claim>());

        _userManager.FindByIdAsync(_actor.Id).Returns(_actor);
        _db.Users.Add(_target);
        _db.SaveChanges();
        _userManager.Users.Returns(_db.Users);
    }

    public void Dispose()
    {
        _db.Dispose();
        _userManager.Dispose();
        _roleManager.Dispose();
    }

    private UserRoleService UserRoles() =>
        new(_userManager, _roleManager, _db, _tenant, _currentUser, _permissions, _audit);

    private RoleService Roles() => new(_roleManager, _db, _tenant, _currentUser, _permissions);

    private void ActorIsAdmin(bool isAdmin) => _userManager.IsInRoleAsync(_actor, RoleConstants.Admin).Returns(isAdmin);

    private static List<UserRoleDto> Rows(params (string Role, bool Enabled)[] rows) =>
        rows.Select(r => new UserRoleDto { RoleName = r.Role, Enabled = r.Enabled }).ToList();

    #region Assigning roles (POST /users/{id}/roles)

    [Theory]
    [InlineData("Admin")]
    [InlineData("admin")]
    [InlineData(" ADMIN ")]
    public async Task AssignRoles_Should_Forbid_NonAdmin_GrantingAdmin(string adminName)
    {
        ActorIsAdmin(false);

        await Should.ThrowAsync<ForbiddenException>(() => UserRoles().AssignRolesAsync(_target.Id, Rows((adminName, true)), CancellationToken.None));

        await _userManager.DidNotReceive().AddToRoleAsync(Arg.Any<FshUser>(), Arg.Any<string>());
    }

    [Fact]
    public async Task AssignRoles_Should_Forbid_NonAdmin_RemovingAdmin()
    {
        ActorIsAdmin(false);
        _userManager.IsInRoleAsync(Arg.Is<FshUser>(u => u.Id == _target.Id), RoleConstants.Admin).Returns(true);

        await Should.ThrowAsync<ForbiddenException>(() => UserRoles().AssignRolesAsync(_target.Id, Rows((RoleConstants.Admin, false)), CancellationToken.None));

        await _userManager.DidNotReceive().RemoveFromRoleAsync(Arg.Any<FshUser>(), Arg.Any<string>());
    }

    [Fact]
    public async Task AssignRoles_Should_Let_NonAdmin_AssignOtherRoles_WithAnUnchangedAdminRow_And_AuditIt()
    {
        ActorIsAdmin(false);

        await UserRoles().AssignRolesAsync(_target.Id, Rows((RoleConstants.Admin, false), ("Manager", true)), CancellationToken.None);

        await _userManager.Received(1).AddToRoleAsync(Arg.Is<FshUser>(u => u.Id == _target.Id), "Manager");
        await _audit.Received(1).RoleAssignedAsync(_target.Id, "cashier", "Manager", _actor.Id, Arg.Any<CancellationToken>());
    }

    [Fact]
    public async Task AssignRoles_Should_Let_Admin_GrantAdmin()
    {
        ActorIsAdmin(true);

        await UserRoles().AssignRolesAsync(_target.Id, Rows((RoleConstants.Admin, true)), CancellationToken.None);

        await _userManager.Received(1).AddToRoleAsync(Arg.Is<FshUser>(u => u.Id == _target.Id), RoleConstants.Admin);
        await _audit.Received(1).RoleAssignedAsync(_target.Id, Arg.Any<string?>(), RoleConstants.Admin, _actor.Id, Arg.Any<CancellationToken>());
    }

    [Fact]
    public async Task AssignRoles_Should_AuditRevocation()
    {
        ActorIsAdmin(true);
        _userManager.IsInRoleAsync(Arg.Is<FshUser>(u => u.Id == _target.Id), "Manager").Returns(true);

        await UserRoles().AssignRolesAsync(_target.Id, Rows(("Manager", false)), CancellationToken.None);

        await _userManager.Received(1).RemoveFromRoleAsync(Arg.Is<FshUser>(u => u.Id == _target.Id), "Manager");
        await _audit.Received(1).RoleRevokedAsync(_target.Id, Arg.Any<string?>(), "Manager", _actor.Id, Arg.Any<CancellationToken>());
    }

    #endregion

    #region Role permissions (PUT /{roleId}/permissions)

    [Fact]
    public async Task UpdatePermissions_Should_Reject_UnknownPermissionNames()
    {
        var ex = await Should.ThrowAsync<CustomException>(() =>
            Roles().UpdatePermissionsAsync(_managerRole.Id, ["Permissions.Totally.Bogus.Thing"], CancellationToken.None));

        ex.StatusCode.ShouldBe(HttpStatusCode.BadRequest);
        (await _db.RoleClaims.CountAsync()).ShouldBe(0);
    }

    [Fact]
    public async Task UpdatePermissions_Should_Forbid_NonAdmin_EditingARoleTheyHold()
    {
        _db.UserRoles.Add(new IdentityUserRole<string> { UserId = _actor.Id, RoleId = _managerRole.Id });
        await _db.SaveChangesAsync();
        _permissions.GetPermissionsAsync(_actor.Id, Arg.Any<CancellationToken>()).Returns([IdentityPermissions.Users.ManageRoles]);

        await Should.ThrowAsync<ForbiddenException>(() =>
            Roles().UpdatePermissionsAsync(_managerRole.Id, [IdentityPermissions.Users.ManageRoles], CancellationToken.None));

        (await _db.RoleClaims.CountAsync()).ShouldBe(0);
    }

    [Fact]
    public async Task UpdatePermissions_Should_Forbid_NonAdmin_GrantingPermissionsTheyLack()
    {
        _permissions.GetPermissionsAsync(_actor.Id, Arg.Any<CancellationToken>()).Returns([IdentityPermissions.Roles.Update]);

        await Should.ThrowAsync<ForbiddenException>(() =>
            Roles().UpdatePermissionsAsync(_managerRole.Id, [IdentityPermissions.Roles.Update, IdentityPermissions.Users.ManageRoles], CancellationToken.None));

        (await _db.RoleClaims.CountAsync()).ShouldBe(0);
    }

    [Fact]
    public async Task UpdatePermissions_Should_Let_NonAdmin_GrantWhatTheyHold_ToAnotherRole()
    {
        _permissions.GetPermissionsAsync(_actor.Id, Arg.Any<CancellationToken>()).Returns([IdentityPermissions.Users.View]);

        await Roles().UpdatePermissionsAsync(_managerRole.Id, [IdentityPermissions.Users.View], CancellationToken.None);

        (await _db.RoleClaims.Select(c => c.ClaimValue).ToListAsync()).ShouldBe([IdentityPermissions.Users.View]);
    }

    [Fact]
    public async Task UpdatePermissions_Should_Let_Admin_GrantAnything()
    {
        _db.Roles.Add(_adminRole);
        _db.UserRoles.Add(new IdentityUserRole<string> { UserId = _actor.Id, RoleId = _adminRole.Id });
        await _db.SaveChangesAsync();
        _permissions.GetPermissionsAsync(_actor.Id, Arg.Any<CancellationToken>()).Returns([]);

        await Roles().UpdatePermissionsAsync(_managerRole.Id, [IdentityPermissions.Users.ManageRoles], CancellationToken.None);

        (await _db.RoleClaims.Select(c => c.ClaimValue).ToListAsync()).ShouldBe([IdentityPermissions.Users.ManageRoles]);
    }

    #endregion

    #region Creating / renaming roles

    [Theory]
    [InlineData("admin")]
    [InlineData("ADMIN")]
    [InlineData("basic")]
    [InlineData("Admin ")]
    [InlineData(" Basic")]
    public async Task CreateRole_Should_Refuse_SystemRoleNames_InAnyCaseOrSpacing(string name)
    {
        var ex = await Should.ThrowAsync<CustomException>(() => Roles().CreateOrUpdateRoleAsync(string.Empty, name, "x", CancellationToken.None));

        ex.StatusCode.ShouldBe(HttpStatusCode.BadRequest);
        await _roleManager.DidNotReceive().CreateAsync(Arg.Any<FshRole>());
    }

    [Fact]
    public async Task RenameRole_Should_Conflict_When_NameIsTaken()
    {
        var other = new FshRole("Stock Keeper") { Id = "role-other" };
        _roleManager.FindByIdAsync(other.Id).Returns(other);

        var ex = await Should.ThrowAsync<CustomException>(() => Roles().CreateOrUpdateRoleAsync(other.Id, " manager ", "x", CancellationToken.None));

        ex.StatusCode.ShouldBe(HttpStatusCode.Conflict);
        await _roleManager.DidNotReceive().UpdateAsync(Arg.Any<FshRole>());
    }

    [Fact]
    public async Task CreateRole_Should_Fail_When_IdentityRefusesIt()
    {
        _roleManager.CreateAsync(Arg.Any<FshRole>()).Returns(IdentityResult.Failed(new IdentityError { Code = "InvalidRoleName", Description = "bad" }));

        var ex = await Should.ThrowAsync<CustomException>(() => Roles().CreateOrUpdateRoleAsync(string.Empty, "Stock Keeper", "x", CancellationToken.None));

        ex.StatusCode.ShouldBe(HttpStatusCode.BadRequest);
        ex.ErrorMessages.ShouldContain("bad");
    }

    [Fact]
    public async Task CreateRole_Should_StoreTheTrimmedName()
    {
        _roleManager.CreateAsync(Arg.Any<FshRole>()).Returns(IdentityResult.Success);

        var dto = await Roles().CreateOrUpdateRoleAsync(string.Empty, "  Stock Keeper  ", "x", CancellationToken.None);

        dto.Name.ShouldBe("Stock Keeper");
        await _roleManager.Received(1).CreateAsync(Arg.Is<FshRole>(r => r.Name == "Stock Keeper"));
    }

    #endregion
}

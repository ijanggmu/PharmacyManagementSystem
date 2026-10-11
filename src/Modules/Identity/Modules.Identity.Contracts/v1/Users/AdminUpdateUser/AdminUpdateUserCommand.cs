using Mediator;

namespace FSH.Modules.Identity.Contracts.v1.Users.AdminUpdateUser;

/// <summary>
/// Administrator update of another user in the current tenant.
/// FirstName, LastName and PhoneNumber are full-replace values. IsActive and Roles are optional
/// and left unchanged when null. Roles is the full set of desired role names.
/// </summary>
public sealed class AdminUpdateUserCommand : ICommand<Unit>
{
    public string Id { get; set; } = string.Empty;
    public string FirstName { get; set; } = string.Empty;
    public string? LastName { get; set; }
    public string? PhoneNumber { get; set; }
    public bool? IsActive { get; set; }
    public List<string>? Roles { get; init; }

    /// <summary>New branch for the user, or null to leave it unchanged. Must be an active branch of the tenant.</summary>
    public Guid? BranchId { get; set; }
}

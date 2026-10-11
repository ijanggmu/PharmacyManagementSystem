using Mediator;
using System.Text.Json.Serialization;

namespace FSH.Modules.Identity.Contracts.v1.Users.RegisterUser;

public class RegisterUserCommand : ICommand<RegisterUserResponse>
{
    public string FirstName { get; set; } = default!;
    public string LastName { get; set; } = default!;
    public string Email { get; set; } = default!;
    public string UserName { get; set; } = default!;
    public string Password { get; set; } = default!;
    public string ConfirmPassword { get; set; } = default!;
    public string? PhoneNumber { get; set; }

    /// <summary>Branch the new user works in. Must be an active branch of the tenant; null uses the default branch.</summary>
    public Guid? BranchId { get; set; }

    [JsonIgnore]
    public string? Origin { get; set; }
}
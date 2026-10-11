using System.Text.Json.Serialization;
using FSH.Modules.Identity.Contracts.v1.Users.RegisterUser;
using Mediator;

namespace FSH.Modules.Identity.Contracts.v1.Users.SelfRegisterUser;

/// <summary>
/// Anonymous self-registration. Deliberately narrower than <see cref="RegisterUserCommand"/>: no branch
/// selection, and the account is always created UNCONFIRMED with the Basic role. Only available for tenants
/// that opted in via the <c>SelfRegistration:AllowedTenants</c> setting (off by default).
/// </summary>
public sealed class SelfRegisterUserCommand : ICommand<RegisterUserResponse>
{
    public string FirstName { get; set; } = default!;
    public string LastName { get; set; } = default!;
    public string Email { get; set; } = default!;
    public string UserName { get; set; } = default!;
    public string Password { get; set; } = default!;
    public string ConfirmPassword { get; set; } = default!;
    public string? PhoneNumber { get; set; }

    [JsonIgnore]
    public string? Origin { get; set; }
}

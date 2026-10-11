using Finbuckle.MultiTenant.Abstractions;
using FSH.Framework.Core.Exceptions;
using FSH.Framework.Shared.Multitenancy;
using FSH.Modules.Identity.Contracts.Services;
using FSH.Modules.Identity.Contracts.v1.Users.RegisterUser;
using FSH.Modules.Identity.Contracts.v1.Users.SelfRegisterUser;
using Mediator;
using Microsoft.Extensions.Options;

namespace FSH.Modules.Identity.Features.v1.Users.SelfRegistration;

public sealed class SelfRegisterUserCommandHandler(
    IUserRegistrationService registrationService,
    IMultiTenantContextAccessor<AppTenantInfo> tenantAccessor,
    IOptions<SelfRegistrationOptions> options)
    : ICommandHandler<SelfRegisterUserCommand, RegisterUserResponse>
{
    public async ValueTask<RegisterUserResponse> Handle(SelfRegisterUserCommand command, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(command);

        // Defence in depth — the endpoint already 404s for tenants that have not opted in.
        if (!options.Value.IsAllowed(tenantAccessor.MultiTenantContext?.TenantInfo?.Id))
        {
            throw new NotFoundException("Self-registration is not available.");
        }

        string userId = await registrationService.SelfRegisterAsync(
            command.FirstName,
            command.LastName,
            command.Email,
            command.UserName,
            command.Password,
            command.ConfirmPassword,
            command.PhoneNumber ?? string.Empty,
            command.Origin ?? string.Empty,
            cancellationToken).ConfigureAwait(false);

        return new RegisterUserResponse(userId);
    }
}

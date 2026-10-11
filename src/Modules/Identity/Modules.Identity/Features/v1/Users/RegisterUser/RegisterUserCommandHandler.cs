using System.Net;
using FSH.Framework.Core.Exceptions;
using FSH.Modules.Identity.Contracts.Services;
using FSH.Modules.Identity.Contracts.v1.Users.RegisterUser;
using FSH.Modules.Multitenancy.Contracts;
using Mediator;

namespace FSH.Modules.Identity.Features.v1.Users.RegisterUser;

public sealed class RegisterUserCommandHandler : ICommandHandler<RegisterUserCommand, RegisterUserResponse>
{
    private readonly IUserService _userService;
    private readonly IUserProfileService _userProfileService;
    private readonly IBranchService _branchService;

    public RegisterUserCommandHandler(IUserService userService, IUserProfileService userProfileService, IBranchService branchService)
    {
        _userService = userService;
        _userProfileService = userProfileService;
        _branchService = branchService;
    }

    public async ValueTask<RegisterUserResponse> Handle(RegisterUserCommand command, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(command);

        // Check the branch before creating the user, so a bad branch id never leaves a half-set-up account.
        if (command.BranchId is Guid branchId)
        {
            await EnsureActiveBranchAsync(_branchService, branchId, cancellationToken).ConfigureAwait(false);
        }

        string userId = await _userService.RegisterAsync(
            command.FirstName,
            command.LastName,
            command.Email,
            command.UserName,
            command.Password,
            command.ConfirmPassword,
            command.PhoneNumber ?? string.Empty,
            command.Origin ?? string.Empty,
            cancellationToken).ConfigureAwait(false);

        if (command.BranchId is Guid assignedBranchId)
        {
            await _userProfileService.SetCurrentBranchIdAsync(userId, assignedBranchId, cancellationToken).ConfigureAwait(false);
        }

        return new RegisterUserResponse(userId);
    }

    /// <summary>Throws 404 for a branch outside the tenant and 400 for an inactive one.</summary>
    internal static async Task EnsureActiveBranchAsync(IBranchService branchService, Guid branchId, CancellationToken cancellationToken)
    {
        var branch = await branchService.GetByIdAsync(branchId, cancellationToken).ConfigureAwait(false);
        if (!branch.IsActive)
        {
            throw new CustomException(
                "The selected branch is inactive. Choose an active branch.",
                Array.Empty<string>(),
                HttpStatusCode.BadRequest);
        }
    }
}
using System.Net;
using FSH.Framework.Core.Context;
using FSH.Framework.Core.Exceptions;
using FSH.Modules.Customers.Contracts.Authorization;
using FSH.Modules.Identity.Contracts.Services;

namespace FSH.Modules.Customers.Services;

/// <summary>
/// Setting or removing a credit limit needs <see cref="CustomersPermissions.Credit.Manage"/> on top of the
/// endpoint's Customers.Create/Update permission. Checked in the handler (not on the route) because the
/// same create/update request also carries ordinary profile fields that only need the endpoint permission.
/// </summary>
public interface ICustomerCreditPermissionGuard
{
    /// <summary>Throws 403 unless the current user may manage credit limits.</summary>
    Task EnsureCanManageCreditAsync(CancellationToken cancellationToken = default);
}

public sealed class CustomerCreditPermissionGuard(ICurrentUser currentUser, IUserPermissionService userPermissions)
    : ICustomerCreditPermissionGuard
{
    public async Task EnsureCanManageCreditAsync(CancellationToken cancellationToken = default)
    {
        Guid userId = currentUser.GetUserId();
        bool allowed = userId != Guid.Empty
            && await userPermissions
                .HasPermissionAsync(userId.ToString(), CustomersPermissions.Credit.Manage, cancellationToken)
                .ConfigureAwait(false);

        if (!allowed)
        {
            throw new CustomException(
                "Changing a customer's credit limit needs the Manage Customer Credit Limits permission.",
                (IEnumerable<string>?)null,
                HttpStatusCode.Forbidden);
        }
    }
}

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

    /// <summary>
    /// Throws 403 unless the current user may put an opening balance on a new customer. Same permission as
    /// credit limits: an opening balance is money on account (it posts to Accounts Receivable and equity),
    /// so a role that may only create customers must not be able to invent a receivable.
    /// </summary>
    Task EnsureCanSetOpeningBalanceAsync(CancellationToken cancellationToken = default);
}

public sealed class CustomerCreditPermissionGuard(ICurrentUser currentUser, IUserPermissionService userPermissions)
    : ICustomerCreditPermissionGuard
{
    public Task EnsureCanManageCreditAsync(CancellationToken cancellationToken = default) =>
        EnsureAsync("Changing a customer's credit limit needs the Manage Customer Credit Limits permission.", cancellationToken);

    public Task EnsureCanSetOpeningBalanceAsync(CancellationToken cancellationToken = default) =>
        EnsureAsync("Giving a new customer an opening balance needs the Manage Customer Credit Limits permission.", cancellationToken);

    private async Task EnsureAsync(string message, CancellationToken cancellationToken)
    {
        Guid userId = currentUser.GetUserId();
        bool allowed = userId != Guid.Empty
            && await userPermissions
                .HasPermissionAsync(userId.ToString(), CustomersPermissions.Credit.Manage, cancellationToken)
                .ConfigureAwait(false);

        if (!allowed)
        {
            throw new CustomException(
                message,
                (IEnumerable<string>?)null,
                HttpStatusCode.Forbidden);
        }
    }
}

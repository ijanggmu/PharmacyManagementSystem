using System.Net;
using FSH.Framework.Core.Context;
using FSH.Framework.Core.Exceptions;
using FSH.Modules.Identity.Contracts.Services;
using FSH.Modules.Suppliers.Contracts.Authorization;

namespace FSH.Modules.Suppliers.Services;

/// <summary>
/// Creating a supplier with a non-zero opening balance needs <see cref="SuppliersPermissions.Ledger.ManageOpeningBalance"/>
/// on top of the endpoint's Suppliers.Create: it moves the AP subledger and posts a GL voucher. Checked in the
/// handler, not on the route, because a supplier with no opening balance needs only Suppliers.Create.
/// </summary>
public interface ISupplierLedgerPermissionGuard
{
    /// <summary>Throws 403 unless the current user may set supplier opening balances.</summary>
    Task EnsureCanManageOpeningBalanceAsync(CancellationToken cancellationToken = default);
}

public sealed class SupplierLedgerPermissionGuard(ICurrentUser currentUser, IUserPermissionService userPermissions)
    : ISupplierLedgerPermissionGuard
{
    public async Task EnsureCanManageOpeningBalanceAsync(CancellationToken cancellationToken = default)
    {
        Guid userId = currentUser.GetUserId();
        bool allowed = userId != Guid.Empty
            && await userPermissions
                .HasPermissionAsync(userId.ToString(), SuppliersPermissions.Ledger.ManageOpeningBalance, cancellationToken)
                .ConfigureAwait(false);

        if (!allowed)
        {
            throw new CustomException(
                "Setting a supplier's opening balance needs the Manage Supplier Opening Balances permission.",
                (IEnumerable<string>?)null,
                HttpStatusCode.Forbidden);
        }
    }
}

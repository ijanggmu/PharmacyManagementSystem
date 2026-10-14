using FSH.Framework.Core.Context;
using FSH.Framework.Shared.Persistence;
using FSH.Modules.Customers.Contracts.Authorization;
using FSH.Modules.Customers.Contracts.Dtos;
using FSH.Modules.Identity.Contracts.Services;

namespace FSH.Modules.Customers.Services;

/// <summary>
/// Customer lookup without money: a caller who may view customers but not the customer ledger (staff at the counter)
/// gets the customer list and profile without balance, credit limit, available credit or total spent. Applied by
/// the HTTP endpoints only; the queries themselves stay complete for in-process readers (Sales, Prescriptions).
/// </summary>
public interface ICustomerFinancialsAccess
{
    /// <summary>Whether the current user holds <see cref="CustomersPermissions.Ledger.View"/>.</summary>
    Task<bool> CanViewAsync(CancellationToken cancellationToken = default);
}

public sealed class CustomerFinancialsAccess(ICurrentUser currentUser, IUserPermissionService userPermissions)
    : ICustomerFinancialsAccess
{
    public async Task<bool> CanViewAsync(CancellationToken cancellationToken = default)
    {
        Guid userId = currentUser.GetUserId();
        return userId != Guid.Empty
            && await userPermissions
                .HasPermissionAsync(userId.ToString(), CustomersPermissions.Ledger.View, cancellationToken)
                .ConfigureAwait(false);
    }
}

/// <summary>Strips the money fields when the caller can't view the ledger.</summary>
public static class CustomerFinancialsRedaction
{
    public static CustomerDto Apply(CustomerDto customer, bool canViewFinancials)
    {
        ArgumentNullException.ThrowIfNull(customer);
        return canViewFinancials ? customer : customer.WithoutFinancials();
    }

    public static PagedResponse<CustomerDto> Apply(PagedResponse<CustomerDto> page, bool canViewFinancials)
    {
        ArgumentNullException.ThrowIfNull(page);
        return canViewFinancials
            ? page
            : new PagedResponse<CustomerDto>
            {
                Items = page.Items.Select(c => c.WithoutFinancials()).ToList(),
                PageNumber = page.PageNumber,
                PageSize = page.PageSize,
                TotalCount = page.TotalCount,
                TotalPages = page.TotalPages,
            };
    }

    public static IReadOnlyList<TopCustomerDto> Apply(IReadOnlyList<TopCustomerDto> customers, bool canViewFinancials)
    {
        ArgumentNullException.ThrowIfNull(customers);
        return canViewFinancials ? customers : customers.Select(c => c with { TotalSpend = null }).ToList();
    }

    public static CustomerSummaryDto Apply(CustomerSummaryDto summary, bool canViewFinancials)
    {
        ArgumentNullException.ThrowIfNull(summary);
        return canViewFinancials ? summary : summary with { TotalSpent = null };
    }
}

using FSH.Modules.Accounting.Contracts.Services;
using FSH.Modules.Accounting.Data;
using Microsoft.EntityFrameworkCore;

namespace FSH.Modules.Accounting.Services;

/// <summary>
/// Tenant-aware payment-method → GL money account lookup. Every flow that moves money (sale tenders,
/// return/refund settlements, customer receipts, supplier payments, expenses, bank deposits, VAT payments,
/// stock paid in cash/bank) resolves its money account here, so a tenant's mapping applies everywhere.
/// </summary>
public interface IPaymentMethodAccountResolver
{
    /// <summary>The account the tenant mapped <paramref name="paymentMethod"/> to, or its built-in default
    /// (<see cref="PaymentMethodAccounts.DefaultAccountCodeFor"/>) when it has no mapping. A blank method is
    /// cash; an unknown one ("online", "mixed" …) follows the "other" mapping.</summary>
    ValueTask<Guid> ResolveAccountIdAsync(string? paymentMethod, CancellationToken cancellationToken = default);
}

/// <summary>Scoped: the tenant's mapping rows are read once per scope (one query), then served from memory.</summary>
public sealed class PaymentMethodAccountResolver(
    AccountingDbContext dbContext,
    IAccountingAccountResolver accountResolver) : IPaymentMethodAccountResolver
{
    private Dictionary<string, Guid>? _mapped;

    public async ValueTask<Guid> ResolveAccountIdAsync(string? paymentMethod, CancellationToken cancellationToken = default)
    {
        string method = PaymentMethodAccounts.Normalize(paymentMethod);

        _mapped ??= await dbContext.PaymentMethodAccounts
            .AsNoTracking()
            .ToDictionaryAsync(m => m.Method, m => m.AccountId, StringComparer.Ordinal, cancellationToken)
            .ConfigureAwait(false);

        if (_mapped.TryGetValue(method, out Guid accountId))
        {
            return accountId;
        }

        return await accountResolver
            .ResolveByCodeAsync(PaymentMethodAccounts.DefaultAccountCodeFor(method), cancellationToken)
            .ConfigureAwait(false);
    }
}

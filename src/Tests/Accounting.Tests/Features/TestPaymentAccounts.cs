using FSH.Modules.Accounting.Contracts.Services;
using FSH.Modules.Accounting.Data;
using FSH.Modules.Accounting.Services;

namespace Accounting.Tests.Features;

/// <summary>The real payment-method resolver over a tenant with no mapping rows (or over the given context's
/// rows), so handler tests that stub <see cref="IAccountingAccountResolver"/> by code keep resolving the
/// built-in defaults (cash → 1000, insurance → 1190, else → 1010).</summary>
internal static class TestPaymentAccounts
{
    public static IPaymentMethodAccountResolver For(IAccountingAccountResolver resolver, AccountingDbContext? db = null)
    {
#pragma warning disable CA2000 // An empty in-memory context that lives as long as the resolver; nothing to release.
        return new PaymentMethodAccountResolver(db ?? AccountingDbContextFactory.Create(), resolver);
#pragma warning restore CA2000
    }
}

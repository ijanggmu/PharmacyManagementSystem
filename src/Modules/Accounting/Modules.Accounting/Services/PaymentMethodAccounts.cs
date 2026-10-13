using FSH.Modules.Accounting.Contracts.Services;

namespace FSH.Modules.Accounting.Services;

/// <summary>
/// The built-in mapping from a payment method to the GL money account, shared by sales, returns, expenses,
/// customer / supplier payments, deposits and VAT payments so every flow agrees: cash (or no method — events
/// raised before the method was carried) → Cash (1000); insurance → Insurance Receivable (1190, the insurer
/// pays later); anything else (bank, cheque, card, eSewa, Khalti, Fonepay, other, …) → Bank (1010).
/// <para>These are only the defaults: a tenant can point each method at its own account (a second bank,
/// an eSewa wallet …) — see <see cref="IPaymentMethodAccountResolver"/>, which every posting path uses.</para>
/// </summary>
internal static class PaymentMethodAccounts
{
    public const string Cash = "cash";
    public const string Card = "card";
    public const string Bank = "bank";
    public const string Cheque = "cheque";
    public const string Esewa = "esewa";
    public const string Khalti = "khalti";
    public const string Fonepay = "fonepay";
    public const string Insurance = "insurance";
    public const string Other = "other";

    /// <summary>Every method a tenant can map, in display order.</summary>
    public static IReadOnlyList<string> Methods { get; } =
        [Cash, Card, Bank, Cheque, Esewa, Khalti, Fonepay, Insurance, Other];

    public static bool IsCash(string? paymentMethod) =>
        string.IsNullOrWhiteSpace(paymentMethod)
        || string.Equals(paymentMethod.Trim(), Cash, StringComparison.OrdinalIgnoreCase);

    public static bool IsKnown(string? method) => Canonical(method) is not null;

    /// <summary>The mapping key for a raw method: blank → cash; a known method → itself (lower case);
    /// anything else ("online", "mixed", …) → other, which defaults to Bank like it always did.</summary>
    public static string Normalize(string? paymentMethod)
    {
        if (IsCash(paymentMethod))
        {
            return Cash;
        }

        return Canonical(paymentMethod) ?? Other;
    }

    /// <summary>The known method's canonical (lower-case) key, or null for an unknown method.</summary>
    private static string? Canonical(string? method)
    {
        string? trimmed = method?.Trim();
        return Methods.FirstOrDefault(m => string.Equals(m, trimmed, StringComparison.OrdinalIgnoreCase));
    }

    /// <summary>The built-in account code for a method when the tenant hasn't mapped it.</summary>
    public static string DefaultAccountCodeFor(string? paymentMethod) => Normalize(paymentMethod) switch
    {
        Cash => AccountingSystemAccountCodes.Cash,
        Insurance => AccountingSystemAccountCodes.InsuranceReceivable,
        _ => AccountingSystemAccountCodes.Bank,
    };

    /// <summary>The historical, tenant-agnostic code (cash → 1000, else 1010). Kept for callers that only
    /// need the built-in default; posting paths resolve through <see cref="IPaymentMethodAccountResolver"/>
    /// so a tenant's own mapping applies.</summary>
    public static string AccountCodeFor(string? paymentMethod) =>
        IsCash(paymentMethod) ? AccountingSystemAccountCodes.Cash : AccountingSystemAccountCodes.Bank;
}

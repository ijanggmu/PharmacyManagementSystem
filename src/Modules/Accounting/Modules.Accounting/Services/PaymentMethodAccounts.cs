using FSH.Modules.Accounting.Contracts.Services;

namespace FSH.Modules.Accounting.Services;

/// <summary>
/// The one mapping from a payment method to the GL money account, shared by expenses and customer /
/// supplier payments so every flow agrees: cash (or no method — events raised before the method was
/// carried) → Cash (1000); anything else (bank, cheque, card, online, eSewa, Khalti, Fonepay, …) → Bank (1010).
/// </summary>
internal static class PaymentMethodAccounts
{
    public static bool IsCash(string? paymentMethod) =>
        string.IsNullOrWhiteSpace(paymentMethod)
        || string.Equals(paymentMethod.Trim(), "cash", StringComparison.OrdinalIgnoreCase);

    public static string AccountCodeFor(string? paymentMethod) =>
        IsCash(paymentMethod) ? AccountingSystemAccountCodes.Cash : AccountingSystemAccountCodes.Bank;
}

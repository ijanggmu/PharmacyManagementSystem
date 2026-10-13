namespace FSH.Modules.Accounting.Contracts.Services;

/// <summary>
/// System accounts whose balance is mirrored by a subledger (customer dues, supplier dues, stock, VAT).
/// Only the flows that also update that subledger may post to them; a manual journal would move the GL
/// without the subledger and the AR/AP/inventory/VAT reconciliations would stop agreeing. The single list
/// used by the manual-journal guard, the GL opening-balance rule and (mirrored) the web app's pickers.
/// </summary>
public static class AccountingControlAccounts
{
    /// <summary>Control account code → where the user should record the entry instead.</summary>
    public static readonly IReadOnlyDictionary<string, string> RecordInstead = new Dictionary<string, string>(StringComparer.Ordinal)
    {
        [AccountingSystemAccountCodes.AccountsReceivable] =
            "Record customer dues through sales, customer receipts or a customer's opening balance.",
        [AccountingSystemAccountCodes.AccountsPayable] =
            "Record supplier dues through purchases, supplier payments or a supplier's opening balance.",
        [AccountingSystemAccountCodes.Inventory] =
            "Record stock value through purchases, stock adjustments or opening stock.",
        [AccountingSystemAccountCodes.InputVatRecoverable] =
            "Input VAT is posted by purchases and settled with a VAT payment.",
        [AccountingSystemAccountCodes.VatPayable] =
            "Output VAT is posted by sales and settled with a VAT payment.",
        [AccountingSystemAccountCodes.ChequesInHand] =
            "Cheques in hand are posted by customer receipts by cheque and cleared from the cheque register.",
        [AccountingSystemAccountCodes.ChequesIssued] =
            "Cheques issued are posted by supplier payments by cheque and cleared from the cheque register.",
    };

    /// <summary>
    /// Control accounts that already receive opening amounts from their own subledger — per-customer and
    /// per-supplier opening balances and opening stock. A GL opening balance on them would count it twice.
    /// </summary>
    public static readonly IReadOnlyCollection<string> FedBySubledgerOpenings =
    [
        AccountingSystemAccountCodes.AccountsReceivable,
        AccountingSystemAccountCodes.AccountsPayable,
        AccountingSystemAccountCodes.Inventory,
    ];

    /// <summary>True when <paramref name="code"/> is a control account (the system account with that code).</summary>
    public static bool IsControlAccount(string code, bool isSystem) =>
        isSystem && code is not null && RecordInstead.ContainsKey(code);

    /// <summary>True when the account's opening balance comes from a subledger, not the GL opening screen.</summary>
    public static bool IsFedBySubledgerOpenings(string code, bool isSystem) =>
        isSystem && code is not null && FedBySubledgerOpenings.Contains(code, StringComparer.Ordinal);
}

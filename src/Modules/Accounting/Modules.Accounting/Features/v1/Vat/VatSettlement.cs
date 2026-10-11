using FSH.Modules.Accounting.Contracts.Services;

namespace FSH.Modules.Accounting.Features.v1.Vat;

/// <summary>
/// What counts as a VAT <b>settlement</b> rather than VAT activity: a VAT payment to IRD (or a refund
/// received from IRD), or a set-off journal moving input VAT against output VAT. These move balances
/// between the VAT accounts and cash/bank; they never change the VAT a period generated, so the VAT return
/// must ignore them. A voucher is a settlement when it is a <see cref="VoucherType"/> voucher, or every one
/// of its lines is on a VAT account (2100/1150) or a cash/bank account — sales, returns, purchases and
/// expenses always carry a revenue, inventory, payable or expense line too.
/// </summary>
public static class VatSettlement
{
    public const string VoucherType = "system_vat_payment";
    public const string ReferenceType = "VatPayment";

    public static readonly IReadOnlyList<string> VatAccountCodes =
        [AccountingSystemAccountCodes.VatPayable, AccountingSystemAccountCodes.InputVatRecoverable];
}

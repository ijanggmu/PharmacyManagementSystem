namespace FSH.Modules.Accounting.Domain;

/// <summary>
/// The TDS (tax deducted at source) categories a tenant starts with, and the one place their default rates live.
/// Seeded by <c>AccountingDbInitializer</c>; the tenant edits names and rates (and adds categories) in Finance setup.
/// <para><b>The rates must be confirmed against the current Finance Act / Income Tax Act 2058 (section 87–89)
/// before relying on them</b> — they change with the annual budget. They are defaults only; the user can edit
/// every rate, and the amount on each document stays editable.</para>
/// <list type="bullet">
/// <item><c>rent</c> — house / property rent paid to an individual: 10%.</item>
/// <item><c>service_vat</c> — service fee / consultancy paid to a VAT-registered resident: 1.5%.</item>
/// <item><c>service_non_vat</c> — service fee / consultancy paid to a non-VAT (PAN-only) resident: 15%.</item>
/// <item><c>commission</c> — commission: 15%.</item>
/// <item><c>contract</c> — contract / agreement payments above the threshold: 1.5%.</item>
/// <item><c>interest</c> — interest paid (other than to a bank / financial institution): 15%.</item>
/// </list>
/// TDS is withheld on the amount <b>excluding VAT</b> (the VAT on the bill is not income of the payee).
/// </summary>
public static class TdsCategoryDefaults
{
    public static IReadOnlyList<(string Code, string Name, decimal RatePercent)> All { get; } =
    [
        ("rent", "Rent", 10m),
        ("service_vat", "Service / consultancy (VAT-registered vendor)", 1.5m),
        ("service_non_vat", "Service / consultancy (non-VAT vendor)", 15m),
        ("commission", "Commission", 15m),
        ("contract", "Contract payment", 1.5m),
        ("interest", "Interest", 15m),
    ];
}

namespace FSH.Modules.Suppliers.Contracts.Dtos;

/// <summary>
/// One supplier's outstanding bills, two ways. By bill date (age): <see cref="Current"/> (0–30 days old),
/// <see cref="Days31To60"/>, <see cref="Days61To90"/>, <see cref="Over90"/>. By due date: <see cref="NotYetDue"/>
/// (due today or later), <see cref="Overdue1To30"/> … <see cref="OverdueOver90"/> (days past due), and
/// <see cref="NoDueDate"/> for bills from a supplier without credit terms. Both views add up to <see cref="Total"/>.
/// <para><see cref="UnappliedAdvance"/> is what the pharmacy has paid (or been credited) beyond every bill: a supplier
/// with a debit balance has a line with zero buckets and the advance. The report's total of <see cref="NetBalance"/>
/// (<see cref="Total"/> − advance) equals the AP control account; the buckets age only what is owed.</para>
/// </summary>
public sealed record ApAgingReportLineDto(
    Guid SupplierId,
    string SupplierName,
    decimal Current,
    decimal Days31To60,
    decimal Days61To90,
    decimal Over90,
    decimal Total,
    decimal NotYetDue = 0m,
    decimal Overdue1To30 = 0m,
    decimal Overdue31To60 = 0m,
    decimal Overdue61To90 = 0m,
    decimal OverdueOver90 = 0m,
    decimal NoDueDate = 0m,
    decimal UnappliedAdvance = 0m)
{
    /// <summary>What is owed to the supplier net of the advance: <see cref="Total"/> − <see cref="UnappliedAdvance"/>.</summary>
    public decimal NetBalance => Total - UnappliedAdvance;
}

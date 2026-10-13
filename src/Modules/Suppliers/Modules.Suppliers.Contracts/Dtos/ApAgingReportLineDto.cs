namespace FSH.Modules.Suppliers.Contracts.Dtos;

/// <summary>
/// One supplier's outstanding bills, two ways. By bill date (age): <see cref="Current"/> (0–30 days old),
/// <see cref="Days31To60"/>, <see cref="Days61To90"/>, <see cref="Over90"/>. By due date: <see cref="NotYetDue"/>
/// (due today or later), <see cref="Overdue1To30"/> … <see cref="OverdueOver90"/> (days past due), and
/// <see cref="NoDueDate"/> for bills from a supplier without credit terms. Both views add up to <see cref="Total"/>.
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
    decimal NoDueDate = 0m);

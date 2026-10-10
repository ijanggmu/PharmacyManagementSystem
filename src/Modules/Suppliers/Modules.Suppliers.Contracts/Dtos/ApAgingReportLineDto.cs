namespace FSH.Modules.Suppliers.Contracts.Dtos;

/// <summary>Mirrors <c>Customers.Contracts.Dtos.ArAgingReportLineDto</c> — see its remarks on the
/// FIFO settlement approximation used in the absence of invoice-level payment allocation.</summary>
public sealed record ApAgingReportLineDto(
    Guid SupplierId,
    string SupplierName,
    decimal Current,
    decimal Days31To60,
    decimal Days61To90,
    decimal Over90,
    decimal Total);

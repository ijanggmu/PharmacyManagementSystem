namespace FSH.Modules.Sales.Contracts.Dtos;

/// <summary><c>PrintNumber</c> 1 is the original; <c>IsCopy</c> is true from the second print on.
/// <c>InvoiceNumber</c> is the number printed — issued by this print when the sale predates numbering.</summary>
public sealed record SalePrintResultDto(Guid SaleId, int PrintNumber, bool IsCopy, DateTime PrintedAtUtc, string? InvoiceNumber = null);

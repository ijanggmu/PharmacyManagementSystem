namespace FSH.Modules.Suppliers.Contracts.Dtos;

/// <summary>Lightweight supplier row for pickers and for resolving supplier names in other modules.</summary>
public sealed record SupplierLookupDto(Guid Id, string Name, string? Phone, bool IsActive, int? CreditDays = null);

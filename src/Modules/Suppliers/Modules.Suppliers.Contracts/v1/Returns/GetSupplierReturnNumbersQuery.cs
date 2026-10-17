using Mediator;

namespace FSH.Modules.Suppliers.Contracts.v1.Returns;

public sealed record SupplierReturnNumberDto(Guid ReturnId, string? DocumentNumber);

/// <summary>Debit-note numbers for supplier returns by id — used by Inventory to show the document behind a
/// supplier-return stock movement. In-process only (no endpoint).</summary>
public sealed record GetSupplierReturnNumbersQuery(IReadOnlyCollection<Guid> ReturnIds)
    : IQuery<IReadOnlyList<SupplierReturnNumberDto>>;

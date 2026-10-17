using Mediator;

namespace FSH.Modules.Sales.Contracts.v1.Returns;

public sealed record SaleReturnNumberDto(Guid ReturnId, string? CreditNoteNumber);

/// <summary>Credit-note numbers for customer returns by id — used by Inventory to show the document behind a
/// returned-stock movement. In-process only (no endpoint).</summary>
public sealed record GetSaleReturnNumbersQuery(IReadOnlyCollection<Guid> ReturnIds)
    : IQuery<IReadOnlyList<SaleReturnNumberDto>>;

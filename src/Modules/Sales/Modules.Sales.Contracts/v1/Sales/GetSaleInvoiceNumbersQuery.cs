using Mediator;

namespace FSH.Modules.Sales.Contracts.v1.Sales;

public sealed record SaleInvoiceNumberDto(Guid SaleId, string? InvoiceNumber);

/// <summary>IRD invoice numbers for sales by id — used by Customers to fill document numbers on AR ledger
/// entries recorded before the number was carried on SaleCompletedIntegrationEvent. In-process only (no endpoint).</summary>
public sealed record GetSaleInvoiceNumbersQuery(IReadOnlyCollection<Guid> SaleIds)
    : IQuery<IReadOnlyList<SaleInvoiceNumberDto>>;

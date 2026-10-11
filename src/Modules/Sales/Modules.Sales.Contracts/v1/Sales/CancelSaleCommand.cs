using Mediator;

namespace FSH.Modules.Sales.Contracts.v1.Sales;

public sealed record CancelSaleCommand(Guid SaleId, string Reason) : ICommand<Guid>;

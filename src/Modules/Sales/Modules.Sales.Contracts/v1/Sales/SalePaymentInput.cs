namespace FSH.Modules.Sales.Contracts.v1.Sales;

/// <summary>
/// One tender leg of a split-tender sale (e.g. cash + card). <paramref name="Method"/> is one of the
/// legacy checkout methods: cash, card, insurance, fonepay, esewa, khalti, bank, credit, other.
/// A <c>credit</c> leg is the on-account portion and requires a customer.
/// </summary>
public sealed record SalePaymentInput(
    string Method,
    decimal Amount,
    string? Reference = null);

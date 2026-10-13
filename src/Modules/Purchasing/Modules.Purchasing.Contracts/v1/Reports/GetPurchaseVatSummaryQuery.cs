using FSH.Modules.Purchasing.Contracts.Dtos;
using Mediator;

namespace FSH.Modules.Purchasing.Contracts.v1.Reports;

/// <summary>
/// Purchase turnover and input VAT for the IRD VAT return, totalled from exactly the same documents and dates as
/// <see cref="GetIrdPurchaseRegisterQuery"/>: received purchase orders and direct goods receipts billed in
/// [<paramref name="PeriodStartUtc"/>, <paramref name="PeriodEndUtc"/>], less supplier debit notes (Suppliers
/// module) and receipt voids recorded in the period. Branch-scoped the same way. In-process; used by
/// Accounting's VAT return.
/// </summary>
public sealed record GetPurchaseVatSummaryQuery(DateTime PeriodStartUtc, DateTime PeriodEndUtc, Guid? BranchId = null)
    : IQuery<PurchaseVatSummaryDto>;

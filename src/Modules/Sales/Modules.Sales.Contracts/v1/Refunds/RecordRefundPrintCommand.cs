using FSH.Modules.Sales.Contracts.Dtos;
using Mediator;

namespace FSH.Modules.Sales.Contracts.v1.Refunds;

/// <summary>Records a credit-note print and returns its print number (1 = original, 2+ = copy).
/// Format: "thermal-58", "thermal-80" or "a5".</summary>
public sealed record RecordRefundPrintCommand(Guid RefundId, string Format) : ICommand<RefundPrintResultDto>;

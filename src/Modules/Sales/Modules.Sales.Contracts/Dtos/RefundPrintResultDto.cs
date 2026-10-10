namespace FSH.Modules.Sales.Contracts.Dtos;

public sealed record RefundPrintResultDto(Guid RefundId, int PrintNumber, bool IsCopy, DateTime PrintedAtUtc);

namespace FSH.Modules.Purchasing.Contracts.Dtos;

public sealed record PurchaseOrderStatusCountsDto(int Total, int Draft, int Approved, int Received, int Cancelled);

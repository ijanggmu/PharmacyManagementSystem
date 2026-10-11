namespace FSH.Modules.Sales.Domain;

/// <summary>A validated-at-the-edge tender leg handed to the sale completion step.</summary>
public sealed record SaleTender(string Method, decimal Amount, string? Reference);

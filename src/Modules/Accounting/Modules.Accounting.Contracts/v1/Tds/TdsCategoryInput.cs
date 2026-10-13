namespace FSH.Modules.Accounting.Contracts.v1.Tds;

/// <summary>One TDS category to save: <paramref name="Code"/> picks the row (a new code adds a category).</summary>
public sealed record TdsCategoryInput(string Code, string Name, decimal RatePercent, bool IsActive = true);

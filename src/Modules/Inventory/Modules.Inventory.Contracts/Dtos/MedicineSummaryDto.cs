namespace FSH.Modules.Inventory.Contracts.Dtos;

/// <summary>The display fields of a medicine — what another module needs to label a line that only
/// stores a medicine id (sale, return and refund lines).</summary>
public sealed record MedicineSummaryDto(
    Guid Id,
    string Name,
    string? GenericName,
    string? Strength,
    string? Form);

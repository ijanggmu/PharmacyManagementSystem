namespace FSH.Modules.Sales.Contracts.Dtos;

/// <summary>One medicine's gross margin over a period — see <c>GetMedicineMarginsQuery</c>.
/// <c>MarginPercent</c> is margin over net revenue, null when there was no net revenue.</summary>
public sealed record MedicineMarginDto(
    Guid MedicineId,
    decimal Quantity,
    decimal NetRevenue,
    decimal Cost,
    decimal Margin,
    decimal? MarginPercent);

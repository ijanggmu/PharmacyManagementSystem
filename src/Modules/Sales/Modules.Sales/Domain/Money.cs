namespace FSH.Modules.Sales.Domain;

/// <summary>Rupee amounts are settled in whole paisa (2 dp, half away from zero) everywhere a sale,
/// return or refund is turned into money that changes hands or is posted.</summary>
internal static class Money
{
    public static decimal Round(decimal amount) => Math.Round(amount, 2, MidpointRounding.AwayFromZero);
}

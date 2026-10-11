namespace FSH.Modules.Tickets.Features.v1.Tickets.SearchTickets;

/// <summary>
/// Shared keyword-search helpers for the ticket listings (tenant <c>GET /tickets</c> and the
/// SuperAdmin <c>GET /tickets/all-tenants</c>). Keywords are matched with ILIKE, so the LIKE
/// wildcards in user input are escaped — searching "50%" must not match every ticket.
/// </summary>
public static class TicketSearch
{
    /// <summary>Escape character passed to <c>EF.Functions.ILike</c>.</summary>
    public const string LikeEscape = "\\";

    /// <summary>Escapes <c>\</c>, <c>%</c> and <c>_</c> so the value matches literally inside a LIKE pattern.</summary>
    public static string EscapeLike(string value)
    {
        ArgumentNullException.ThrowIfNull(value);
        return value
            .Replace("\\", "\\\\", StringComparison.Ordinal)
            .Replace("%", "\\%", StringComparison.Ordinal)
            .Replace("_", "\\_", StringComparison.Ordinal);
    }
}

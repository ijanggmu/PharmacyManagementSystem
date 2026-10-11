namespace FSH.Modules.Auditing.Persistence;

/// <summary>
/// LINQ-translatable helpers for querying the <c>jsonb</c> <c>PayloadJson</c> column.
/// </summary>
/// <remarks>
/// <para>
/// <see cref="AuditRecord.PayloadJson"/> is a <c>string</c> in the CLR model but maps to a PostgreSQL
/// <c>jsonb</c> column (see <see cref="AuditRecordConfiguration"/>). Calling
/// <c>EF.Functions.ILike(record.PayloadJson, ...)</c> directly emits
/// <c>"PayloadJson" ILIKE @p</c>, which PostgreSQL rejects at execution time with
/// <c>function pg_catalog.like_escape(jsonb, unknown) does not exist</c> — ILIKE only
/// accepts <c>text</c>. The crash surfaces as an HTTP 500, not a wrong result.
/// </para>
/// <para>
/// <see cref="AsText"/> is mapped to a SQL <c>(jsonb)::text</c> cast via
/// <c>HasDbFunction(...).HasTranslation(...)</c> in <see cref="AuditDbContext.OnModelCreating"/>,
/// so <c>EF.Functions.ILike(AuditJsonbFunctions.AsText(record.PayloadJson), ...)</c> generates
/// valid, executable SQL: <c>"PayloadJson"::text ILIKE @p</c>.
/// </para>
/// </remarks>
public static class AuditJsonbFunctions
{
    /// <summary>
    /// Casts the <c>jsonb</c> payload column to <c>text</c> so it can be used with text
    /// operators such as ILIKE. Only valid inside EF Core LINQ queries; throws if invoked
    /// in memory.
    /// </summary>
    public static string AsText(string payloadJson) =>
        throw new InvalidOperationException(
            $"{nameof(AsText)} is a database-only function and must not be evaluated client-side.");

    /// <summary>
    /// Extracts a top-level payload property as text — <c>jsonb_extract_path_text(payload, key)</c>.
    /// Database-only; returns <c>null</c> when the key is missing (legacy rows).
    /// </summary>
    public static string? JsonText(string payloadJson, string key) =>
        throw new InvalidOperationException(
            $"{nameof(JsonText)} is a database-only function and must not be evaluated client-side.");

    /// <summary>
    /// Extracts a nested payload property as text — <c>jsonb_extract_path_text(payload, key1, key2)</c>.
    /// </summary>
    public static string? JsonText(string payloadJson, string key1, string key2) =>
        throw new InvalidOperationException(
            $"{nameof(JsonText)} is a database-only function and must not be evaluated client-side.");

    /// <summary>
    /// Extracts a top-level numeric payload property as an integer —
    /// <c>CAST(jsonb_extract_path_text(payload, key) AS integer)</c>.
    /// </summary>
    public static int? JsonInt(string payloadJson, string key) =>
        throw new InvalidOperationException(
            $"{nameof(JsonInt)} is a database-only function and must not be evaluated client-side.");
}

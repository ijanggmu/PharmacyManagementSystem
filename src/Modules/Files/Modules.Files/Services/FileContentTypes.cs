namespace FSH.Modules.Files.Services;

/// <summary>
/// Server-side content-type policy for uploads and downloads. The client chooses the Content-Type of a
/// presigned upload, and object storage serves that type back — so an extension allowlist alone lets
/// "invoice.pdf" be stored as text/html and rendered as a page. Uploads must declare a type that matches
/// the extension; downloads are forced to <c>attachment</c> unless the type is a known-safe raster image.
/// </summary>
internal static class FileContentTypes
{
    private static readonly Dictionary<string, string[]> AllowedByExtension = new(StringComparer.OrdinalIgnoreCase)
    {
        [".jpg"] = ["image/jpeg", "image/pjpeg"],
        [".jpeg"] = ["image/jpeg", "image/pjpeg"],
        [".png"] = ["image/png"],
        [".webp"] = ["image/webp"],
        [".gif"] = ["image/gif"],
        [".ico"] = ["image/x-icon", "image/vnd.microsoft.icon"],
        [".pdf"] = ["application/pdf"],
        [".docx"] = ["application/vnd.openxmlformats-officedocument.wordprocessingml.document"],
        [".xlsx"] = ["application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"],
        [".pptx"] = ["application/vnd.openxmlformats-officedocument.presentationml.presentation"],
        [".txt"] = ["text/plain"],
        [".csv"] = ["text/csv", "application/csv", "text/plain", "application/vnd.ms-excel"],
        [".zip"] = ["application/zip", "application/x-zip-compressed"],
    };

    /// <summary>Raster image types browsers render without executing anything — the only ones served inline.</summary>
    private static readonly HashSet<string> InlineSafe = new(StringComparer.OrdinalIgnoreCase)
    {
        "image/jpeg", "image/pjpeg", "image/png", "image/webp", "image/gif", "image/x-icon", "image/vnd.microsoft.icon",
    };

    /// <summary>Lower-cased media type without parameters (e.g. "text/plain; charset=utf-8" → "text/plain").</summary>
    public static string Normalize(string? contentType)
    {
        if (string.IsNullOrWhiteSpace(contentType))
        {
            return string.Empty;
        }

        int semicolon = contentType.IndexOf(';', StringComparison.Ordinal);
        string mediaType = semicolon >= 0 ? contentType[..semicolon] : contentType;
#pragma warning disable CA1308 // media types are canonically lower-case
        return mediaType.Trim().ToLowerInvariant();
#pragma warning restore CA1308
    }

    /// <summary>
    /// True when <paramref name="contentType"/> is an accepted type for <paramref name="extension"/>.
    /// Extensions without a known mapping (custom category config) only accept application/octet-stream.
    /// </summary>
    public static bool IsAllowed(string? extension, string? contentType)
    {
        string normalized = Normalize(contentType);
        if (normalized.Length == 0 || string.IsNullOrWhiteSpace(extension))
        {
            return false;
        }

        return AllowedByExtension.TryGetValue(extension, out var allowed)
            ? allowed.Contains(normalized, StringComparer.OrdinalIgnoreCase)
            : string.Equals(normalized, "application/octet-stream", StringComparison.Ordinal);
    }

    public static bool IsInlineSafe(string? contentType) => InlineSafe.Contains(Normalize(contentType));

    /// <summary>
    /// Builds a Content-Disposition value. <c>inline</c> is honoured only for inline-safe images; everything
    /// else is downloaded. The filename is emitted twice per RFC 6266/5987: an ASCII-only quoted fallback
    /// (quotes, backslashes, control and non-ASCII characters replaced) and a UTF-8 percent-encoded
    /// <c>filename*</c>, so a crafted name can never break out of the header value.
    /// </summary>
    public static string ContentDisposition(string fileName, string? contentType, bool inlineRequested)
    {
        string mode = inlineRequested && IsInlineSafe(contentType) ? "inline" : "attachment";
        string name = string.IsNullOrWhiteSpace(fileName) ? "download" : fileName;

        var ascii = new System.Text.StringBuilder(name.Length);
        foreach (char c in name)
        {
            ascii.Append(c is < ' ' or > '~' or '"' or '\\' ? '_' : c);
        }

        string encoded = Uri.EscapeDataString(name);
        return $"{mode}; filename=\"{ascii}\"; filename*=UTF-8''{encoded}";
    }
}

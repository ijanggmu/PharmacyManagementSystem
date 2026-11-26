using System.Globalization;
using System.Security.Cryptography;
using System.Text;
using FSH.Modules.Multitenancy.Features.v1.SignUpTenant;

namespace FSH.Modules.Multitenancy.Services;

/// <summary>
/// Turns a pharmacy name into its tenant code (sign-in code and host label): lowercase ASCII letters,
/// digits and single hyphens, 2-40 characters, the same shape the sign-up flow accepts.
/// </summary>
public static class TenantSlug
{
    public const int MaxLength = 40;
    private const string Fallback = "pharmacy";

    /// <summary>"Shree Ram Pharmacy and Clinic" gives "shree-ram-pharmacy-and-clinic". Names with no Latin
    /// letters or digits (e.g. Devanagari only) fall back to "pharmacy".</summary>
    public static string FromName(string? name)
    {
        if (string.IsNullOrWhiteSpace(name))
        {
            return Fallback;
        }

        // Strip accents (é → e) before dropping everything that isn't a-z / 0-9.
        string decomposed = name.Normalize(NormalizationForm.FormD);
        var builder = new StringBuilder(decomposed.Length);
        bool pendingHyphen = false;
        foreach (char raw in decomposed)
        {
            if (CharUnicodeInfo.GetUnicodeCategory(raw) == UnicodeCategory.NonSpacingMark)
            {
                continue;
            }

            char c = char.ToLowerInvariant(raw);
            if (c is (>= 'a' and <= 'z') or (>= '0' and <= '9'))
            {
                if (pendingHyphen && builder.Length > 0)
                {
                    builder.Append('-');
                }

                pendingHyphen = false;
                builder.Append(c);
            }
            else
            {
                pendingHyphen = true;
            }
        }

        string slug = Trim(builder.ToString());
        return slug.Length < 2 ? Fallback : slug;
    }

    /// <summary>
    /// The name's slug, or the first free "slug-2", "slug-3"… when it is reserved or taken; after 50
    /// tries a random 4-character suffix.
    /// </summary>
    public static async Task<string> GenerateUniqueAsync(
        string? name, Func<string, CancellationToken, Task<bool>> exists, CancellationToken cancellationToken = default)
    {
        ArgumentNullException.ThrowIfNull(exists);

        string baseSlug = FromName(name);
        if (await IsFreeAsync(baseSlug, exists, cancellationToken).ConfigureAwait(false))
        {
            return baseSlug;
        }

        for (int n = 2; n <= 50; n++)
        {
            string candidate = WithSuffix(baseSlug, n.ToString(CultureInfo.InvariantCulture));
            if (await IsFreeAsync(candidate, exists, cancellationToken).ConfigureAwait(false))
            {
                return candidate;
            }
        }

        while (true)
        {
            string candidate = WithSuffix(baseSlug, RandomSuffix());
            if (await IsFreeAsync(candidate, exists, cancellationToken).ConfigureAwait(false))
            {
                return candidate;
            }
        }
    }

    private static async Task<bool> IsFreeAsync(
        string slug, Func<string, CancellationToken, Task<bool>> exists, CancellationToken cancellationToken) =>
        !SignUpTenantCommandValidator.ReservedSlugs.Contains(slug)
        && !await exists(slug, cancellationToken).ConfigureAwait(false);

    private static string WithSuffix(string baseSlug, string suffix)
    {
        int room = MaxLength - suffix.Length - 1;
        string head = Trim(baseSlug.Length > room ? baseSlug[..room] : baseSlug);
        return $"{head}-{suffix}";
    }

    private static string Trim(string slug)
    {
        if (slug.Length > MaxLength)
        {
            slug = slug[..MaxLength];
        }

        return slug.Trim('-');
    }

    private static string RandomSuffix()
    {
        const string alphabet = "abcdefghjkmnpqrstuvwxyz23456789";
        Span<char> chars = stackalloc char[4];
        for (int i = 0; i < chars.Length; i++)
        {
            chars[i] = alphabet[RandomNumberGenerator.GetInt32(alphabet.Length)];
        }

        return new string(chars);
    }
}

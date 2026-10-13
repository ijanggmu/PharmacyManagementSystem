using System.Globalization;
using System.Text.RegularExpressions;
using FSH.Modules.Notifications.Contracts.v1.Sms;
using FSH.Modules.Sales.Contracts.Fiscal;

namespace FSH.Modules.Notifications.Sms;

/// <summary>The values a template's placeholders are filled with. Null renders as empty.</summary>
public sealed record SmsTemplateValues(
    string? Customer = null,
    string? Amount = null,
    string? DueDate = null,
    string? Pharmacy = null,
    string? Invoice = null);

/// <summary>
/// Per-tenant SMS templates: placeholders, default texts (English and Nepali), rendering and the checks a template
/// must pass. Refill reminders are marketing-like (sent automatically to customers who opted in), so their template must
/// keep the STOP opt-out line.
/// </summary>
public static partial class SmsTemplates
{
    public const int MaxTemplateLength = 640;

    /// <summary>Longest rendered message the queue accepts (about 5 GSM parts / 11 Unicode parts).</summary>
    public const int MaxMessageLength = 765;

    public static IReadOnlyList<string> Placeholders { get; } = ["{customer}", "{amount}", "{due_date}", "{pharmacy}", "{invoice}"];

    private static readonly Dictionary<(string Kind, string Language), string> Defaults = new()
    {
        [(SmsKinds.DuesReminder, SmsLanguages.English)] =
            "Dear {customer}, {amount} for {invoice} was due on {due_date}. Please clear it at your earliest convenience. - {pharmacy}",
        [(SmsKinds.DuesReminder, SmsLanguages.Nepali)] =
            "आदरणीय {customer}, {invoice} को {amount} मिति {due_date} मा तिर्नुपर्ने थियो। कृपया चाँडो भुक्तानी गर्नुहोला। - {pharmacy}",
        [(SmsKinds.RefillReminder, SmsLanguages.English)] =
            "Dear {customer}, your prescription refill is due (valid till {due_date}). Visit {pharmacy}. Reply STOP to opt out.",
        [(SmsKinds.RefillReminder, SmsLanguages.Nepali)] =
            "आदरणीय {customer}, तपाईंको औषधि फेरि लिने समय भयो ({due_date} सम्म मान्य)। - {pharmacy}। SMS बन्द गर्न STOP लेख्नुहोस्।",
        [(SmsKinds.Receipt, SmsLanguages.English)] =
            "Thank you for visiting {pharmacy}. Bill {invoice}: {amount}. Get well soon!",
        [(SmsKinds.Receipt, SmsLanguages.Nepali)] =
            "{pharmacy} मा आउनुभएकोमा धन्यवाद। बिल {invoice}: {amount}। शीघ्र स्वास्थ्य लाभको कामना!",
        [(SmsKinds.Test, SmsLanguages.English)] = "Test SMS from {pharmacy}: your SMS settings work.",
        [(SmsKinds.Test, SmsLanguages.Nepali)] = "{pharmacy} बाट परीक्षण SMS: तपाईंको SMS सेटिङ ठीक छ।",
    };

    public static string Default(string kind, string language) =>
        Defaults.TryGetValue((kind, language), out var text)
            ? text
            : Defaults.GetValueOrDefault((kind, SmsLanguages.English), "{pharmacy}");

    public static string Render(string template, SmsTemplateValues values)
    {
        ArgumentNullException.ThrowIfNull(template);
        ArgumentNullException.ThrowIfNull(values);
        string text = PlaceholderPattern().Replace(template, match => match.Groups[1].Value.ToUpperInvariant() switch
        {
            "CUSTOMER" => values.Customer ?? string.Empty,
            "AMOUNT" => values.Amount ?? string.Empty,
            "DUE_DATE" => values.DueDate ?? string.Empty,
            "PHARMACY" => values.Pharmacy ?? string.Empty,
            "INVOICE" => values.Invoice ?? string.Empty,
            _ => match.Value,
        });

        // An empty value can leave doubled spaces behind ("for  was due").
        return MultiSpacePattern().Replace(text, " ").Trim();
    }

    /// <summary>Placeholders in <paramref name="template"/> that are not one of <see cref="Placeholders"/>.</summary>
    public static IReadOnlyList<string> UnknownPlaceholders(string template)
    {
        ArgumentNullException.ThrowIfNull(template);
        return PlaceholderPattern().Matches(template)
            .Select(m => m.Value)
            .Where(p => !Placeholders.Contains(p, StringComparer.OrdinalIgnoreCase))
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .ToList();
    }

    /// <summary>A refill-reminder template must tell the customer how to opt out (the word STOP).</summary>
    public static bool HasOptOut(string template) =>
        template is not null && template.Contains("STOP", StringComparison.OrdinalIgnoreCase);

    public static string FormatAmount(decimal amount, string language) =>
        (language == SmsLanguages.Nepali ? "रु. " : "Rs. ") + amount.ToString("#,##0.00", CultureInfo.InvariantCulture);

    /// <summary>English: an AD date (13 Oct 2026). Nepali: the Bikram Sambat date (2083.06.27).</summary>
    public static string FormatDate(DateOnly date, string language) =>
        language == SmsLanguages.Nepali
            ? BikramSambat.FromAd(date).ToIrdString()
            : date.ToString("d MMM yyyy", CultureInfo.InvariantCulture);

    /// <summary>The Nepal calendar day of a UTC instant, formatted per <paramref name="language"/>.</summary>
    public static string FormatDateUtc(DateTime utc, string language) =>
        FormatDate(DateOnly.FromDateTime(SmsQuietHours.ToNepal(utc)), language);

    /// <summary>"INV-1", "INV-1, INV-2" or "INV-1, INV-2 +3 more" — keeps a many-invoice reminder short.</summary>
    public static string InvoiceList(IReadOnlyList<string> numbers, string language)
    {
        ArgumentNullException.ThrowIfNull(numbers);
        var shown = numbers.Where(n => !string.IsNullOrWhiteSpace(n)).Take(2).ToList();
        int more = numbers.Count(n => !string.IsNullOrWhiteSpace(n)) - shown.Count;
        string list = string.Join(", ", shown);
        if (more > 0)
        {
            list += language == SmsLanguages.Nepali
                ? string.Create(CultureInfo.InvariantCulture, $" र अरू {more}")
                : string.Create(CultureInfo.InvariantCulture, $" +{more} more");
        }

        if (list.Length > 0)
        {
            return list;
        }

        return language == SmsLanguages.Nepali ? "बाँकी रकम" : "your account";
    }

    [GeneratedRegex(@"\{([a-zA-Z_]+)\}")]
    private static partial Regex PlaceholderPattern();

    [GeneratedRegex(@"[ \t]{2,}")]
    private static partial Regex MultiSpacePattern();
}

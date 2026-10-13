namespace FSH.Modules.Notifications.Sms;

/// <summary>How a message is billed: encoding, length in that encoding, and the number of SMS parts.</summary>
public sealed record SmsSegmentInfo(string Encoding, int Length, int Segments, int PerSegment, int Remaining);

/// <summary>
/// SMS length and segment counting. A message that fits the GSM 03.38 7-bit alphabet is sent as GSM: 160 characters
/// in one SMS, 153 per part once it is split (the rest of each part is the concatenation header); characters of the
/// GSM extension table (<c>^ { } \ [ ~ ] | €</c> and form feed) take two. Anything else — Devanagari included — goes
/// as Unicode (UCS-2): 70 characters in one SMS, 67 per part. Length is counted in UTF-16 code units, as the gateways
/// count it. The web app has the same rules in <c>features/sms/lib/sms-segments.ts</c>.
/// </summary>
public static class SmsText
{
    public const string Gsm = "GSM";
    public const string Unicode = "Unicode";

    public const int GsmSingle = 160;
    public const int GsmPart = 153;
    public const int UnicodeSingle = 70;
    public const int UnicodePart = 67;

    private const string GsmBasic =
        "@£$¥èéùìòÇ\nØø\rÅåΔ_ΦΓΛΩΠΨΣΘΞÆæßÉ !\"#¤%&'()*+,-./0123456789:;<=>?" +
        "¡ABCDEFGHIJKLMNOPQRSTUVWXYZÄÖÑÜ§¿abcdefghijklmnopqrstuvwxyzäöñüà";

    private const string GsmExtended = "^{}\\[~]|€\f";

    public static bool IsGsm(string text)
    {
        ArgumentNullException.ThrowIfNull(text);
        foreach (char c in text)
        {
            if (!GsmBasic.Contains(c, StringComparison.Ordinal) && !GsmExtended.Contains(c, StringComparison.Ordinal))
            {
                return false;
            }
        }

        return true;
    }

    public static SmsSegmentInfo Count(string? text)
    {
        text ??= string.Empty;
        if (IsGsm(text))
        {
            int length = 0;
            foreach (char c in text)
            {
                length += GsmExtended.Contains(c, StringComparison.Ordinal) ? 2 : 1;
            }

            return Build(Gsm, length, GsmSingle, GsmPart);
        }

        return Build(Unicode, text.Length, UnicodeSingle, UnicodePart);
    }

    private static SmsSegmentInfo Build(string encoding, int length, int single, int part)
    {
        if (length == 0)
        {
            return new SmsSegmentInfo(encoding, 0, 0, single, single);
        }

        if (length <= single)
        {
            return new SmsSegmentInfo(encoding, length, 1, single, single - length);
        }

        int segments = (length + part - 1) / part;
        return new SmsSegmentInfo(encoding, length, segments, part, (segments * part) - length);
    }
}

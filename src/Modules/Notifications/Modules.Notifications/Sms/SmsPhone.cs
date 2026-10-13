namespace FSH.Modules.Notifications.Sms;

/// <summary>Nepali mobile numbers: 10 digits starting 96, 97 or 98, optionally written with +977 / 977 / spaces / dashes.</summary>
public static class SmsPhone
{
    /// <summary>The 10-digit mobile number the gateways expect, or null when <paramref name="raw"/> is not a Nepali mobile.</summary>
    public static string? Normalize(string? raw)
    {
        if (string.IsNullOrWhiteSpace(raw))
        {
            return null;
        }

        var digits = new System.Text.StringBuilder(raw.Length);
        foreach (char c in raw)
        {
            if (char.IsAsciiDigit(c))
            {
                digits.Append(c);
            }
            else if (c is not (' ' or '-' or '+' or '(' or ')' or '.'))
            {
                return null;
            }
        }

        string number = digits.ToString();
        if (number.Length == 13 && number.StartsWith("977", StringComparison.Ordinal))
        {
            number = number[3..];
        }

        return number.Length == 10 && number[0] == '9' && number[1] is '6' or '7' or '8' ? number : null;
    }

    /// <summary>For logs and the SMS log page: the first two and last two digits only (98******34).</summary>
    public static string Mask(string? phone)
    {
        if (string.IsNullOrEmpty(phone))
        {
            return string.Empty;
        }

        if (phone.Length <= 4)
        {
            return new string('*', phone.Length);
        }

        return string.Concat(phone.AsSpan(0, 2), new string('*', phone.Length - 4), phone.AsSpan(phone.Length - 2));
    }
}

using System.Security.Cryptography;

namespace FSH.Modules.Inventory.Domain;

/// <summary>
/// EAN-13 helpers for pharmacy-generated barcodes. Generated codes use GS1 prefix 2 (restricted
/// circulation, "in-store" numbers), so they never clash with a manufacturer's real GTIN and any
/// retail scanner reads them.
/// </summary>
public static class Ean13
{
    public const char InStorePrefix = '2';

    /// <summary>A random in-store EAN-13: '2' + 11 random digits + check digit.</summary>
    public static string NewInStoreCode()
    {
        Span<char> digits = stackalloc char[12];
        digits[0] = InStorePrefix;
        for (int i = 1; i < digits.Length; i++)
        {
            digits[i] = (char)('0' + RandomNumberGenerator.GetInt32(10));
        }

        string body = new(digits);
        return body + CheckDigit(body);
    }

    /// <summary>True for 13 digits whose last digit is the correct EAN-13 check digit.</summary>
    public static bool IsValid(string? code) =>
        code is { Length: 13 } && code.All(char.IsAsciiDigit) && code[12] == CheckDigit(code[..12]);

    /// <summary>Mod-10 check digit over 12 digits, weights 1,3,1,3… from the left.</summary>
    public static char CheckDigit(string twelveDigits)
    {
        ArgumentNullException.ThrowIfNull(twelveDigits);
        if (twelveDigits.Length != 12 || !twelveDigits.All(char.IsAsciiDigit))
        {
            throw new ArgumentException("Expected exactly 12 digits.", nameof(twelveDigits));
        }

        int sum = 0;
        for (int i = 0; i < 12; i++)
        {
            int digit = twelveDigits[i] - '0';
            sum += i % 2 == 0 ? digit : digit * 3;
        }

        return (char)('0' + ((10 - (sum % 10)) % 10));
    }
}

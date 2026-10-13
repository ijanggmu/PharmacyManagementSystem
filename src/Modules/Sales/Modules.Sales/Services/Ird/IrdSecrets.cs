using System.Text.RegularExpressions;
using Microsoft.AspNetCore.DataProtection;

namespace FSH.Modules.Sales.Services.Ird;

/// <summary>Encrypts the CBMS API password at rest (Data Protection, same approach as the Fonepay secrets). The
/// plain password only ever exists in memory while a request body is being built; it is never logged.</summary>
public sealed class IrdSecrets(IDataProtectionProvider dataProtectionProvider)
{
    private const string Purpose = "FSH.Sales.IrdSettings.v1";
    private readonly IDataProtector _protector = dataProtectionProvider.CreateProtector(Purpose);

    /// <summary>Null for an empty value, so the caller keeps what is stored.</summary>
    public string? ProtectOrKeep(string? plainText) =>
        string.IsNullOrWhiteSpace(plainText) ? null : _protector.Protect(plainText.Trim());

    public string Unprotect(string protectedValue) => _protector.Unprotect(protectedValue);
}

/// <summary>Nepal PAN / VAT numbers are 9 digits.</summary>
public static partial class IrdPan
{
    public static bool IsValid(string? pan) => pan is not null && PanPattern().IsMatch(pan.Trim());

    [GeneratedRegex(@"^\d{9}$")]
    private static partial Regex PanPattern();
}

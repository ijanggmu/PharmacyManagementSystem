using System.Security.Cryptography;
using System.Text;

namespace FSH.Modules.Customers.Services;

/// <summary>
/// Deterministic ids for ledger/loyalty entries that must be applied at most once per business event
/// (a sale's AR posting, a cancellation's reversal, a return's credit …). The id is a name-based UUID
/// (SHA-256 of "<c>kind:referenceId</c>", version 5 layout), so a redelivered event or a retry produces the
/// SAME id and the primary key turns a second insert into a failure instead of a double posting.
/// </summary>
internal static class CustomerEntryIds
{
    public const string SaleArKind = "sale-ar";
    public const string SaleRedeemKind = "sale-redeem";

    public static Guid For(string kind, Guid referenceId)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(kind);
        byte[] hash = SHA256.HashData(Encoding.UTF8.GetBytes($"{kind}:{referenceId:N}"));
        byte[] bytes = hash[..16];
        bytes[6] = (byte)((bytes[6] & 0x0F) | 0x50);
        bytes[8] = (byte)((bytes[8] & 0x3F) | 0x80);
        return new Guid(bytes);
    }
}
